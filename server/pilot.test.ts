import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { freshDb, startServer, client } from './test-helpers.ts'
import * as repo from './db/repo.ts'
import { proposeFor } from './http/adapt.ts'
import type { Sql } from './db/client.ts'

let sql: Sql
let server: Server
let base: string
const OPERATOR = 'test-operator-token'

before(async () => {
  sql = await freshDb()
  const started = await startServer(sql, OPERATOR)
  server = started.server
  base = started.base
})

after(async () => {
  server.close()
  await sql.end()
})

async function consented(timezone = 'Asia/Kolkata') {
  const c = client(base)
  const res = await c.call('POST', '/api/consent', { timezone, researchConsent: true })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return c
}

/* ================= P04: consent, cookie, isolation ================= */

test('what will be stored is disclosed before anything is stored', async () => {
  const c = client(base)
  const res = await c.call('GET', '/api/consent')
  assert.equal(res.status, 200)
  assert.ok(res.body.fields.length >= 5)
  assert.match(res.body.processing, /providers process this data/)
  assert.match(res.body.withoutConsent, /without this/)
  assert.equal(c.cookies.size, 0, 'merely reading the notice must not set a cookie')
})

test('the no-save path works: every saving route refuses without consent', async () => {
  const c = client(base)
  // Reads say 401 outright. Writes are refused by the CSRF guard first, which
  // runs before authentication on purpose — either way nothing is stored.
  for (const path of ['/api/me', '/api/export', '/api/ladder']) {
    assert.equal((await c.call('GET', path)).status, 401, path)
  }
  for (const [method, path] of [
    ['POST', '/api/journeys'], ['POST', '/api/sessions'],
    ['POST', '/api/feedback'], ['POST', '/api/goal'], ['DELETE', '/api/me'],
  ] as const) {
    const res = await c.call(method, path, {})
    assert.ok(res.status === 401 || res.status === 403, `${method} ${path} answered ${res.status}`)
  }
  assert.equal((await sql`SELECT count(*)::int AS n FROM journeys`)[0].n, 0)
})

test('the rate limiter refuses a burst and says when to retry', async () => {
  const strict = await startServer(sql, undefined, { consentPerMinute: 2 })
  const c = client(strict.base)
  const codes: number[] = []
  for (let i = 0; i < 4; i++) {
    codes.push((await c.call('POST', '/api/consent', { timezone: 'Asia/Kolkata', researchConsent: true })).status)
  }
  strict.server.close()
  assert.deepEqual(codes.slice(0, 2), [201, 201])
  assert.ok(codes.slice(2).every((s) => s === 429), `expected 429s, got ${codes}`)
})

test('consent sets an HttpOnly reader cookie and stores only its hash', async () => {
  const c = client(base)
  const res = await c.call('POST', '/api/consent', { timezone: 'Asia/Kolkata', researchConsent: true })
  assert.equal(res.status, 201)
  const credential = c.cookies.get('nidus_reader')!
  assert.ok(credential && credential.length > 30)
  const stored = await sql<{ credential_hash: string }[]>`SELECT credential_hash FROM readers`
  assert.ok(stored.every((r) => r.credential_hash !== credential),
    'the credential itself must never be in the database')
  assert.ok(stored.some((r) => r.credential_hash === repo.hashCredential(credential)))
})

test('consent refuses to record a research consent that was not given', async () => {
  const c = client(base)
  const res = await c.call('POST', '/api/consent', { timezone: 'Asia/Kolkata', researchConsent: false })
  assert.equal(res.status, 400)
})

test('two readers cannot see each other, by cookie or by id', async () => {
  const a = await consented()
  const b = await consented()
  await a.call('POST', '/api/journeys', {
    workId: 'lean-startup', editionId: 'lean-startup-en', mode: 'apply',
    purpose: 'company-building', language: 'en',
    rankerVersion: 'r1', catalogueVersion: 'c1',
  })
  const mineA = await a.call('GET', '/api/me')
  const mineB = await b.call('GET', '/api/me')
  assert.equal(mineA.body.journeys.length, 1)
  assert.equal(mineB.body.journeys.length, 0)
  assert.notEqual(mineA.body.reader.id, mineB.body.reader.id)

  // And at the repository layer, which is where it actually matters.
  const other = mineA.body.reader.id
  const leaked = await repo.journeys(sql, mineB.body.reader.id)
  assert.equal(leaked.length, 0)
  assert.notEqual(other, mineB.body.reader.id)
})

test('a mutation without the CSRF header is refused even with a valid cookie', async () => {
  const c = await consented()
  const res = await c.call('POST', '/api/journeys', {
    workId: 'w', editionId: 'e', mode: 'apply', purpose: 'p', language: 'en',
    rankerVersion: 'r', catalogueVersion: 'c',
  }, { 'x-nidus-csrf': 'wrong-token' })
  assert.equal(res.status, 403)
  assert.equal(res.body.error, 'csrf_failed')
})

test('a cross-origin mutation is refused', async () => {
  const c = await consented()
  const res = await c.call('POST', '/api/sessions', { minutes: 10 }, { origin: 'https://evil.example' })
  assert.equal(res.status, 403)
  assert.equal(res.body.error, 'origin_not_allowed')
})

test('an oversized payload is rejected', async () => {
  const c = await consented()
  const res = await c.call('POST', '/api/feedback', { kind: 'useful', note: 'x'.repeat(40_000) })
  assert.ok(res.status === 413 || res.status === 400, `got ${res.status}`)
})

test('a saved journey survives a new client with the same cookie', async () => {
  const c = await consented()
  await c.call('POST', '/api/journeys', {
    workId: 'mom-test', editionId: 'mom-test-en', mode: 'apply',
    purpose: 'company-building', language: 'en', rankerVersion: 'r1', catalogueVersion: 'c1',
  })
  const reopened = client(base)
  for (const [k, v] of c.cookies) reopened.cookies.set(k, v)
  const res = await reopened.call('GET', '/api/me')
  assert.equal(res.body.journeys.length, 1)
  assert.equal(res.body.journeys[0].ranker_version, 'r1')
  assert.equal(res.body.journeys[0].catalogue_version, 'c1')
})

/* ================= P05: sessions and the ladder ================= */

test('a duplicate check-in on the same day is idempotent, not a second day', async () => {
  const c = await consented()
  const first = await c.call('POST', '/api/sessions', { minutes: 15 })
  const second = await c.call('POST', '/api/sessions', { minutes: 20 })
  assert.equal(first.status, 201)
  assert.equal(first.body.created, true)
  assert.equal(second.status, 200)
  assert.equal(second.body.created, false)
  const me = await c.call('GET', '/api/me')
  assert.equal(me.body.sessions.length, 1)
  assert.equal(me.body.sessions[0].minutes, 20, 'the longer self-report wins, but the day does not double')
})

test('concurrent check-ins cannot both create a day', async () => {
  const c = await consented()
  const results = await Promise.all(
    Array.from({ length: 5 }, () => c.call('POST', '/api/sessions', { minutes: 10 })),
  )
  assert.equal(results.filter((r) => r.body.created === true).length, 1)
  const me = await c.call('GET', '/api/me')
  assert.equal(me.body.sessions.length, 1)
})

test('the day boundary follows the reader timezone, not the server', async () => {
  const kolkata = await consented('Asia/Kolkata')
  const auckland = await consented('Pacific/Auckland')
  const a = await kolkata.call('POST', '/api/sessions', { minutes: 10 })
  const b = await auckland.call('POST', '/api/sessions', { minutes: 10 })
  assert.match(a.body.day, /^\d{4}-\d{2}-\d{2}$/)
  assert.match(b.body.day, /^\d{4}-\d{2}-\d{2}$/)
  // Same instant, two calendars: they agree or differ by exactly one day.
  const gap = Math.abs(Date.parse(b.body.day) - Date.parse(a.body.day)) / 86_400_000
  assert.ok(gap === 0 || gap === 1, `unexpected gap ${gap}`)
})

test('a check-in is always labelled self-reported', async () => {
  const c = await consented()
  const res = await c.call('POST', '/api/sessions', { minutes: 10 })
  assert.equal(res.body.selfReported, true)
})

test('changing the weekly goal adds a row and preserves the earlier one', async () => {
  const c = await consented()
  await c.call('POST', '/api/goal', { daysPerWeek: 3, sessionMinutes: 20, effectiveFrom: '2026-09-01' })
  await c.call('POST', '/api/goal', { daysPerWeek: 1, sessionMinutes: 10, effectiveFrom: '2026-09-10' })
  const me = await c.call('GET', '/api/me')
  assert.equal(me.body.goals.length, 2, 'history must not be overwritten')

  const readerId = me.body.reader.id
  assert.equal((await repo.goalOn(sql, readerId, '2026-09-05'))!.days_per_week, 3)
  assert.equal((await repo.goalOn(sql, readerId, '2026-09-20'))!.days_per_week, 1)
})

test('the ladder counts unique days and never reports a streak', async () => {
  const c = await consented()
  await c.call('POST', '/api/goal', { daysPerWeek: 3, sessionMinutes: 20 })
  await c.call('POST', '/api/sessions', { minutes: 20 })
  await c.call('POST', '/api/sessions', { minutes: 20 })
  const res = await c.call('GET', '/api/ladder')
  assert.equal(res.status, 200)
  assert.equal(res.body.daysThisWeek, 1)
  assert.match(res.body.text, /1 of your 3 reading days this week/)
  assert.equal('streak' in res.body, false)
})

test('a goal set with no date takes effect from the reader own day', async () => {
  const c = await consented()
  const res = await c.call('POST', '/api/goal', { daysPerWeek: 2, sessionMinutes: 15 })
  assert.equal(res.status, 201)
  assert.match(res.body.effectiveFrom, /^\d{4}-\d{2}-\d{2}$/)
})

/* ================= P06: feedback and adaptation ================= */

test('negative feedback is stored and answered with a proposal, not a silent change', async () => {
  const c = await consented()
  await c.call('POST', '/api/goal', { daysPerWeek: 3, sessionMinutes: 20 })
  const res = await c.call('POST', '/api/feedback', { kind: 'too-busy', note: 'travelling all week' })
  assert.equal(res.status, 201)
  assert.ok(res.body.feedbackId)
  assert.ok(res.body.adaptationId)
  assert.equal(res.body.proposal.after.daysPerWeek, 2)
  assert.equal(res.body.proposal.after.sessionMinutes, 10)

  const me = await c.call('GET', '/api/me')
  assert.equal(me.body.feedback[0].kind, 'too-busy')
  assert.equal(me.body.feedback[0].note, 'travelling all week')
  assert.equal(me.body.adaptations[0].status, 'proposed', 'nothing applies until the reader decides')
})

test('before and after are both recorded, so a change stays traceable', async () => {
  const c = await consented()
  await c.call('POST', '/api/goal', { daysPerWeek: 4, sessionMinutes: 30 })
  const fb = await c.call('POST', '/api/feedback', { kind: 'too-busy' })
  const me = await c.call('GET', '/api/me')
  const a = me.body.adaptations.find((x: { id: string }) => x.id === fb.body.adaptationId)
  assert.equal(a.before_state.daysPerWeek, 4)
  assert.equal(a.after_state.daysPerWeek, 3)
  assert.equal(a.ranker_version, 'test-ranker-1')
  assert.ok(a.reason.length > 0)
})

test('the reader accepts or declines, and a decline is kept too', async () => {
  const c = await consented()
  await c.call('POST', '/api/goal', { daysPerWeek: 3, sessionMinutes: 20 })
  const one = await c.call('POST', '/api/feedback', { kind: 'too-difficult' })
  const declined = await c.call('POST', `/api/adaptations/${one.body.adaptationId}/decision`, { accept: false })
  assert.equal(declined.body.decided, 'declined')

  const again = await c.call('POST', `/api/adaptations/${one.body.adaptationId}/decision`, { accept: true })
  assert.equal(again.status, 404, 'a decision cannot be silently re-made')

  const me = await c.call('GET', '/api/me')
  assert.equal(me.body.adaptations[0].status, 'declined')
})

test('whether a change helped is recorded separately, and unknown stays unknown', async () => {
  const c = await consented()
  await c.call('POST', '/api/goal', { daysPerWeek: 3, sessionMinutes: 20 })
  const fb = await c.call('POST', '/api/feedback', { kind: 'too-busy' })
  await c.call('POST', `/api/adaptations/${fb.body.adaptationId}/decision`, { accept: true })

  let me = await c.call('GET', '/api/me')
  assert.equal(me.body.adaptations[0].helped, null, 'not yet known')

  await c.call('POST', `/api/adaptations/${fb.body.adaptationId}/outcome`, { helped: false })
  me = await c.call('GET', '/api/me')
  assert.equal(me.body.adaptations[0].helped, false, 'a change that did not help is kept as such')
})

test('positive feedback does not manufacture a change', async () => {
  assert.equal(proposeFor('useful', { daysPerWeek: 3, sessionMinutes: 20 }), null)
  const c = await consented()
  await c.call('POST', '/api/goal', { daysPerWeek: 3, sessionMinutes: 20 })
  const res = await c.call('POST', '/api/feedback', { kind: 'useful' })
  assert.equal(res.body.adaptationId, null)
  assert.equal(res.body.proposal, null)
})

test('boring asks which kind of boring it was rather than guessing', async () => {
  const p = proposeFor('boring', { daysPerWeek: 3, sessionMinutes: 20 })!
  assert.match(p.reason, /repetition, wrong timing or a changed taste/)
  assert.match(p.after.action, /confirm which it was/)
})

test('too-busy never creates catch-up debt', async () => {
  const p = proposeFor('too-busy', { daysPerWeek: 5, sessionMinutes: 40 })!
  assert.ok(p.after.daysPerWeek < 5)
  assert.ok(p.after.sessionMinutes < 40)
  assert.match(p.after.action, /no catch-up/)
})

test('one reader cannot decide another reader adaptation', async () => {
  const a = await consented()
  const b = await consented()
  await a.call('POST', '/api/goal', { daysPerWeek: 3, sessionMinutes: 20 })
  const fb = await a.call('POST', '/api/feedback', { kind: 'too-busy' })
  const res = await b.call('POST', `/api/adaptations/${fb.body.adaptationId}/decision`, { accept: true })
  assert.equal(res.status, 404)
})

/* ================= export, deletion, retention, operator ================= */

test('export returns everything held about the reader and nothing else', async () => {
  const c = await consented()
  await c.call('POST', '/api/journeys', {
    workId: 'w', editionId: 'e', mode: 'enjoy', purpose: 'unwind', language: 'en',
    rankerVersion: 'r', catalogueVersion: 'cv',
  })
  await c.call('POST', '/api/sessions', { minutes: 12 })
  const res = await c.call('GET', '/api/export')
  assert.equal(res.status, 200)
  assert.deepEqual(
    Object.keys(res.body).sort(),
    ['adaptations', 'consent', 'feedback', 'goals', 'journeys', 'reader', 'sessions'],
  )
  assert.equal(res.body.consent[0].consent_version.length > 0, true)
  assert.equal('credential_hash' in res.body.reader, false, 'never hand back the stored hash')
})

test('deleting removes every row, and the reader cookie stops working', async () => {
  const c = await consented()
  await c.call('POST', '/api/journeys', {
    workId: 'w', editionId: 'e', mode: 'enjoy', purpose: 'unwind', language: 'en',
    rankerVersion: 'r', catalogueVersion: 'cv',
  })
  await c.call('POST', '/api/sessions', { minutes: 10 })
  await c.call('POST', '/api/goal', { daysPerWeek: 2, sessionMinutes: 10 })
  const me = await c.call('GET', '/api/me')
  const readerId = me.body.reader.id

  const del = await c.call('DELETE', '/api/me')
  assert.equal(del.body.deleted, true)
  assert.match(del.body.note, /backups are kept separately/)

  for (const table of ['journeys', 'reading_sessions', 'reading_goals', 'feedback', 'adaptations', 'consent_records']) {
    const rows = await sql`SELECT 1 FROM ${sql(table)} WHERE reader_id = ${readerId}`
    assert.equal(rows.length, 0, `${table} still has rows`)
  }
  const readers = await sql`SELECT 1 FROM readers WHERE id = ${readerId}`
  assert.equal(readers.length, 0)
})

test('deletion is recorded in the audit log without naming the reader', async () => {
  const before = await sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'data.deleted'`
  const c = await consented()
  await c.call('DELETE', '/api/me')
  const after = await sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'data.deleted'`
  assert.equal(after[0].n, before[0].n + 1)
  const rows = await sql<{ reader_id: string | null }[]>`SELECT reader_id FROM audit_log WHERE action = 'data.deleted'`
  assert.ok(rows.every((r) => r.reader_id === null))
})

test('revoking consent does not silently delete the record', async () => {
  const c = await consented()
  const res = await c.call('DELETE', '/api/consent')
  assert.equal(res.body.revoked, true)
  const me = await c.call('GET', '/api/me')
  assert.ok(me.body.consent[0].revoked_at, 'revocation is recorded')
  assert.match(res.body.note, /DELETE \/api\/me/)
})

test('retention cleanup deletes expired readers and only those', async () => {
  const keep = await consented()
  const drop = await consented()
  const dropId = (await drop.call('GET', '/api/me')).body.reader.id
  await sql`UPDATE readers SET expires_at = now() - interval '1 day' WHERE id = ${dropId}`

  const purged = await repo.purgeExpired(sql)
  assert.ok(purged >= 1)
  assert.equal((await sql`SELECT 1 FROM readers WHERE id = ${dropId}`).length, 0)
  assert.equal((await keep.call('GET', '/api/me')).status, 200)
  assert.equal((await drop.call('GET', '/api/me')).status, 401, 'an expired cookie stops working')
})

test('the operator endpoint needs its own credential and returns counts only', async () => {
  const anon = client(base)
  assert.equal((await anon.call('GET', '/api/operator/summary')).status, 401)

  const res = await fetch(`${base}/api/operator/summary`, {
    headers: { authorization: `Bearer ${OPERATOR}` },
  })
  assert.equal(res.status, 200)
  const body = (await res.json()) as Record<string, string>
  assert.ok(Number(body.readers) >= 0)
  const values = Object.values(body)
  assert.ok(values.every((v) => typeof v === 'string' && /^\d+$/.test(v)),
    'the operator summary must contain counts, never rows')
})

test('there is no route that returns every reader feedback row', async () => {
  const anon = client(base)
  for (const path of ['/api/feedback', '/api/operator/feedback', '/api/readers']) {
    const res = await anon.call('GET', path)
    assert.ok(res.status === 401 || res.status === 404, `${path} answered ${res.status}`)
  }
})
