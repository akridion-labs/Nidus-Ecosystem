import express from 'express'
import cookieParser from 'cookie-parser'
import type { Request, Response, NextFunction } from 'express'
import type { Sql } from '../db/client.ts'
import * as repo from '../db/repo.ts'
import {
  READER_COOKIE, CSRF_COOKIE, cookieOptions, csrfCookieOptions, csrfGuard,
  newCsrfToken, rateLimit, securityHeaders,
} from './security.ts'
import {
  AdaptationDecision, AdaptationOutcome, CheckInRequest, CONSENT_VERSION,
  ConsentRequest, DISCLOSED_FIELDS, FeedbackRequest, GoalRequest, JourneyRequest,
  RETENTION_DAYS,
} from './contracts.ts'
import { proposeFor } from './adapt.ts'

export type AppOptions = {
  sql: Sql
  secureCookies?: boolean
  allowedOrigins?: string[]
  /** Operator endpoints are refused entirely unless this is configured. */
  operatorToken?: string
  rankerVersion?: string
  /** Production defaults are deliberately tight; tests raise them explicitly. */
  limits?: { consentPerMinute?: number; writesPerMinute?: number; operatorPerMinute?: number }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { readerId?: string } }
}

export function createApp(opts: AppOptions) {
  const { sql } = opts
  const secure = opts.secureCookies ?? true
  const consentMax = opts.limits?.consentPerMinute ?? 5
  const writeMax = opts.limits?.writesPerMinute ?? 30
  const operatorMax = opts.limits?.operatorPerMinute ?? 10
  const app = express()

  app.set('trust proxy', 1)
  app.use(securityHeaders)
  // Payload cap. A reading pilot has no reason to accept a large body.
  app.use(express.json({ limit: '16kb' }))
  app.use(cookieParser())
  app.use(csrfGuard(opts.allowedOrigins ?? [], ['/api/consent']))

  /** Resolves the reader from the cookie. Never trusts an id from the body. */
  const requireReader = async (req: Request, res: Response, next: NextFunction) => {
    const credential = req.cookies?.[READER_COOKIE]
    if (!credential) return res.status(401).json({ error: 'no_consent' })
    const reader = await repo.readerByCredential(sql, credential)
    if (!reader) return res.status(401).json({ error: 'unknown_or_expired' })
    req.readerId = reader.id
    next()
  }

  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next) }

  /* ---------- what will be stored, before anything is stored ---------- */

  app.get('/api/consent', (_req, res) => {
    res.json({
      consentVersion: CONSENT_VERSION,
      retentionDays: RETENTION_DAYS,
      fields: DISCLOSED_FIELDS,
      // The honest version. "Never shared with anyone" would be false.
      processing:
        'Hosting and database providers process this data to run the service. ' +
        'It is not sold, not used for advertising profiles, and not used to train models. ' +
        'Only the operator can read it, to run and evaluate the pilot.',
      withoutConsent:
        'You can use the recommendations without this. Nothing is saved, and nothing here is required.',
    })
  })

  app.post('/api/consent', rateLimit({ windowMs: 60_000, max: consentMax }), wrap(async (req, res) => {
    const parsed = ConsentRequest.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid', issues: parsed.error.issues })

    const credential = repo.newCredential()
    const readerId = await repo.createReaderWithConsent(sql, {
      credential,
      timezone: parsed.data.timezone,
      consentVersion: CONSENT_VERSION,
      disclosedFields: [...DISCLOSED_FIELDS],
      researchConsent: parsed.data.researchConsent,
      contactConsent: parsed.data.contactConsent,
      retentionDays: RETENTION_DAYS,
    })
    const csrf = newCsrfToken()
    res.cookie(READER_COOKIE, credential, cookieOptions(secure, RETENTION_DAYS))
    res.cookie(CSRF_COOKIE, csrf, csrfCookieOptions(secure, RETENTION_DAYS))
    // The identifier is never returned to the browser in a readable form.
    res.status(201).json({ saved: true, consentVersion: CONSENT_VERSION, retentionDays: RETENTION_DAYS, readerKnown: Boolean(readerId) })
  }))

  app.delete('/api/consent', requireReader, wrap(async (req, res) => {
    await repo.revokeConsent(sql, req.readerId!)
    res.json({ revoked: true, note: 'Your saved record is still here. Use DELETE /api/me to remove it.' })
  }))

  /* ---------- the saved journey ---------- */

  app.get('/api/me', requireReader, wrap(async (req, res) => {
    res.json(await repo.exportReader(sql, req.readerId!))
  }))

  app.post('/api/journeys', requireReader, rateLimit({ windowMs: 60_000, max: writeMax }), wrap(async (req, res) => {
    const parsed = JourneyRequest.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid', issues: parsed.error.issues })
    res.status(201).json({ id: await repo.saveJourney(sql, req.readerId!, parsed.data) })
  }))

  /* ---------- rhythm ---------- */

  app.post('/api/goal', requireReader, rateLimit({ windowMs: 60_000, max: writeMax }), wrap(async (req, res) => {
    const parsed = GoalRequest.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid', issues: parsed.error.issues })
    const effectiveFrom = parsed.data.effectiveFrom ?? (await repo.localDay(sql, req.readerId!))
    const id = await repo.setGoal(sql, req.readerId!, { ...parsed.data, effectiveFrom })
    res.status(201).json({ id, effectiveFrom })
  }))

  app.post('/api/sessions', requireReader, rateLimit({ windowMs: 60_000, max: writeMax }), wrap(async (req, res) => {
    const parsed = CheckInRequest.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid', issues: parsed.error.issues })
    const day = await repo.localDay(sql, req.readerId!)
    const result = await repo.checkIn(sql, req.readerId!, { ...parsed.data, day })
    // 200 rather than 201 on a repeat, so a double tap is visibly not a second day.
    res.status(result.created ? 201 : 200).json({ ...result, day, selfReported: true })
  }))

  app.get('/api/ladder', requireReader, wrap(async (req, res) => {
    const day = await repo.localDay(sql, req.readerId!)
    const [goal, days] = await Promise.all([
      repo.goalOn(sql, req.readerId!, day),
      repo.sessionDays(sql, req.readerId!),
    ])
    // Unique days this week, counted from the reader's own calendar.
    const weekStart = new Date(`${day}T00:00:00Z`)
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7))
    const thisWeek = days.filter((d) => new Date(d.local_day) >= weekStart).length
    res.json({
      goal, daysThisWeek: thisWeek, totalDays: days.length,
      // A missed week removes nothing, and this endpoint never returns a streak.
      text: goal ? `${thisWeek} of your ${goal.days_per_week} reading days this week.` : null,
      selfReported: true,
    })
  }))

  /* ---------- feedback and adaptation ---------- */

  app.post('/api/feedback', requireReader, rateLimit({ windowMs: 60_000, max: writeMax }), wrap(async (req, res) => {
    const parsed = FeedbackRequest.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid', issues: parsed.error.issues })

    const feedbackId = await repo.addFeedback(sql, req.readerId!, parsed.data)
    const day = await repo.localDay(sql, req.readerId!)
    const goal = await repo.goalOn(sql, req.readerId!, day)
    const proposal = goal
      ? proposeFor(parsed.data.kind, { daysPerWeek: goal.days_per_week, sessionMinutes: goal.session_minutes })
      : null

    let adaptationId: string | null = null
    if (proposal) {
      adaptationId = await repo.proposeAdaptation(sql, req.readerId!, {
        journeyId: parsed.data.journeyId ?? null,
        feedbackId,
        reason: proposal.reason,
        before: proposal.before,
        after: proposal.after,
        rankerVersion: opts.rankerVersion ?? 'unset',
      })
    }
    // The feedback is kept whether or not a change is proposed or accepted.
    res.status(201).json({ feedbackId, adaptationId, proposal })
  }))

  app.post('/api/adaptations/:id/decision', requireReader, wrap(async (req, res) => {
    const parsed = AdaptationDecision.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid' })
    const ok = await repo.decideAdaptation(sql, req.readerId!, String(req.params.id), parsed.data.accept)
    if (!ok) return res.status(404).json({ error: 'not_found_or_already_decided' })
    res.json({ decided: parsed.data.accept ? 'accepted' : 'declined' })
  }))

  app.post('/api/adaptations/:id/outcome', requireReader, wrap(async (req, res) => {
    const parsed = AdaptationOutcome.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid' })
    const ok = await repo.recordAdaptationOutcome(sql, req.readerId!, String(req.params.id), parsed.data.helped)
    if (!ok) return res.status(404).json({ error: 'not_found_or_not_accepted' })
    res.json({ recorded: true })
  }))

  /* ---------- the reader's controls ---------- */

  app.get('/api/export', requireReader, wrap(async (req, res) => {
    res.set('Content-Disposition', 'attachment; filename="nidus-my-data.json"')
    res.json(await repo.exportReader(sql, req.readerId!))
  }))

  app.delete('/api/me', requireReader, wrap(async (req, res) => {
    const deleted = await repo.deleteReader(sql, req.readerId!)
    res.clearCookie(READER_COOKIE, { path: '/' })
    res.clearCookie(CSRF_COOKIE, { path: '/' })
    res.json({
      deleted,
      note: 'Removed from the live database. Off-machine backups are kept separately and are not covered by this.',
    })
  }))

  /* ---------- operator: counts only, separate credential ---------- */

  app.get('/api/operator/summary', rateLimit({ windowMs: 60_000, max: operatorMax }), wrap(async (req, res) => {
    if (!opts.operatorToken) return res.status(404).json({ error: 'not_enabled' })
    if (req.get('authorization') !== `Bearer ${opts.operatorToken}`) {
      return res.status(401).json({ error: 'unauthorized' })
    }
    res.json(await repo.operatorCounts(sql))
  }))

  app.post('/api/operator/purge', rateLimit({ windowMs: 60_000, max: operatorMax }), wrap(async (req, res) => {
    if (!opts.operatorToken) return res.status(404).json({ error: 'not_enabled' })
    if (req.get('authorization') !== `Bearer ${opts.operatorToken}`) {
      return res.status(401).json({ error: 'unauthorized' })
    }
    res.json({ purged: await repo.purgeExpired(sql) })
  }))

  // A JSON API answers 404 in JSON. The default HTML page leaks the framework.
  app.use((_req: Request, res: Response) => res.status(404).json({ error: 'not_found' }))

  // Never leak a stack trace or a driver message to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Body-parser errors carry their own status. A 16 kB cap that answers 500
    // looks like a bug to the client instead of a limit.
    const status = (err as { status?: number; statusCode?: number })?.status
      ?? (err as { statusCode?: number })?.statusCode
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return res.status(status).json({ error: status === 413 ? 'payload_too_large' : 'bad_request' })
    }
    console.error('[nidus] request failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'server_error' })
  })

  return app
}
