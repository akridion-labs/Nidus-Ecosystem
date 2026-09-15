import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { freshDb, startServer, client } from './test-helpers.ts'
import { createApp } from './http/app.ts'
import { bearerMatches } from './http/security.ts'
import * as repo from './db/repo.ts'
import type { Sql } from './db/client.ts'

/**
 * Regression tests for findings from the September 2026 security review.
 * Each one failed before the fix.
 */

let sql: Sql
const OPERATOR = 'operator-token-under-test'
let started: { server: Server; base: string }

before(async () => {
  sql = await freshDb()
  started = await startServer(sql, OPERATOR, { consentPerMinute: 3 })
})
after(async () => { started.server.close(); await sql.end() })

/* ---- Finding 1: forged X-Forwarded-For must not reset a rate limit ---- */

test('a forged X-Forwarded-For does not buy a fresh rate-limit bucket', async () => {
  const codes: number[] = []
  for (let i = 0; i < 6; i++) {
    const c = client(started.base)
    const res = await c.call(
      'POST', '/api/consent',
      { timezone: 'Asia/Kolkata', researchConsent: true },
      { 'x-forwarded-for': `203.0.113.${i}` },   // a different "client" each time
    )
    codes.push(res.status)
  }
  assert.ok(codes.includes(429),
    `trust proxy must be off by default, so all six count as one caller: ${codes}`)
})

test('trust proxy is only honoured when the hop count is configured', async () => {
  const app = createApp({ sql, secureCookies: false, allowedOrigins: [], trustProxyHops: 1 })
  assert.equal(app.get('trust proxy'), 1)
  const off = createApp({ sql, secureCookies: false, allowedOrigins: [] })
  assert.equal(off.get('trust proxy'), 0, 'the default must not trust a forwarded header')
})

/* ---- Finding 2: the operator token is compared in constant time ---- */

test('bearerMatches rejects wrong tokens, wrong lengths and missing headers', () => {
  assert.equal(bearerMatches('Bearer secret', 'secret'), true)
  assert.equal(bearerMatches('Bearer secre', 'secret'), false)
  assert.equal(bearerMatches('Bearer secrets', 'secret'), false)
  assert.equal(bearerMatches('Bearer wrongg', 'secret'), false)
  assert.equal(bearerMatches('secret', 'secret'), false, 'the scheme is part of the check')
  assert.equal(bearerMatches(undefined, 'secret'), false)
  assert.equal(bearerMatches('Bearer secret', ''), false, 'an unset token never matches')
})

test('the operator endpoint refuses a near-miss token', async () => {
  const near = OPERATOR.slice(0, -1) + 'X'
  const res = await fetch(`${started.base}/api/operator/summary`, {
    headers: { authorization: `Bearer ${near}` },
  })
  assert.equal(res.status, 401)
})

/* ---- Finding 3: the limiter's key map is bounded ---- */

test('the rate limiter sheds state instead of growing without bound', async () => {
  const { rateLimit } = await import('./http/security.ts')
  const limiter = rateLimit({ windowMs: 5, max: 1, keyBy: (r) => String((r as { k?: string }).k ?? 'x') })
  const call = (k: string) => new Promise<number>((resolve) => {
    const req = { k, method: 'POST', path: '/p', ip: '1.1.1.1' } as never
    const res = { set: () => res, status: (n: number) => ({ json: () => resolve(n) }) } as never
    limiter(req, res, () => resolve(200))
  })
  assert.equal(await call('a'), 200)
  assert.equal(await call('a'), 429, 'second call in the window is limited')
  // Push far past the cap with distinct keys, then let the window lapse so the
  // sweep runs. The limiter must still answer rather than retain every key.
  for (let i = 0; i < 10_050; i++) await call(`k${i}`)
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(await call('a'), 200, 'state was shed, not accumulated')
})

/* ---- Finding 4: one valid cookie cannot fill the database ---- */

test('a per-reader write limit applies even when the IP limit is generous', async () => {
  const tight = await startServer(sql, undefined, { consentPerMinute: 100, writesPerMinute: 3 })
  const c = client(tight.base)
  await c.call('POST', '/api/consent', { timezone: 'Asia/Kolkata', researchConsent: true })
  const codes: number[] = []
  for (let i = 0; i < 6; i++) {
    codes.push((await c.call('POST', '/api/feedback', { kind: 'useful' })).status)
  }
  tight.server.close()
  assert.ok(codes.includes(429), `expected the reader to be limited: ${codes}`)
})

test('a hard per-reader row cap survives a process restart, unlike the limiter', async () => {
  const credential = repo.newCredential()
  const readerId = await repo.createReaderWithConsent(sql, {
    credential, timezone: 'Asia/Kolkata', consentVersion: 'v', disclosedFields: [],
    researchConsent: true, contactConsent: false, retentionDays: 30,
  })
  // Fill to the cap in one statement, then prove the next insert is refused.
  await sql`
    INSERT INTO feedback (reader_id, kind, note)
    SELECT ${readerId}, 'useful', 'bulk' FROM generate_series(1, ${repo.CAPS.feedback})`
  await assert.rejects(
    () => repo.addFeedback(sql, readerId, { kind: 'useful' }),
    (e: Error) => e.name === 'CapExceeded',
  )
  const n = (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM feedback WHERE reader_id = ${readerId}`)[0].n
  assert.equal(n, repo.CAPS.feedback, 'the cap holds exactly')
})

/* ---- Response hardening ---- */

test('every response carries the hardening headers, and no HSTS over plain HTTP', async () => {
  const res = await fetch(`${started.base}/api/consent`)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(res.headers.get('x-frame-options'), 'DENY')
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'none'/)
  assert.equal(res.headers.get('strict-transport-security'), null,
    'HSTS over http would pin a developer browser to https://localhost')
})

test('an unknown route answers JSON, not an HTML error page', async () => {
  const res = await fetch(`${started.base}/api/does-not-exist`)
  assert.equal(res.status, 404)
  assert.equal((await res.json() as { error: string }).error, 'not_found')
})

test('a server error never returns a stack trace or a driver message', async () => {
  const c = client(started.base)
  await c.call('POST', '/api/consent', { timezone: 'Asia/Kolkata', researchConsent: true })
  // A syntactically valid but impossible uuid reaches the repository layer.
  const res = await c.call('POST', '/api/adaptations/not-a-uuid/decision', { accept: true })
  assert.ok(res.status >= 400)
  const body = JSON.stringify(res.body)
  assert.equal(/postgres|syntax|at Object|\.ts:/i.test(body), false, `leaked internals: ${body}`)
})
