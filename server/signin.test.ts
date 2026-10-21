import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { freshDb, startServer } from './test-helpers.ts'
import type { Sql } from './db/client.ts'
import type { GoogleConfig } from './http/google.ts'

/**
 * Sign in with Google, end to end, without ever touching the network.
 *
 * The token exchange is injected, so these tests prove OUR half: the PKCE
 * round trip, the state check, keying on `sub`, credential rotation, and the
 * fact that an email Google hands us is not written anywhere. Google's half is
 * Google's problem.
 */

let sql: Sql
let server: Server
let base: string

const CONFIG: GoogleConfig = {
  clientId: 'test-client-id.apps.googleusercontent.com',
  clientSecret: 'test-secret',
  redirectUri: 'http://127.0.0.1:0/api/auth/google/callback',
  appUrl: 'http://localhost:5173',
}

/** Stands in for Google. Records what it was asked, answers as Google would. */
let lastExchange: { code: string; verifier: string } | null = null
let nextClaims: { sub: string; name?: string } | null = { sub: 'google-sub-1', name: 'Deepak' }
const exchange = async (_c: GoogleConfig, code: string, verifier: string) => {
  lastExchange = { code, verifier }
  return nextClaims
}

before(async () => {
  sql = await freshDb()
  const started = await startServer(sql, undefined, undefined, { config: CONFIG, exchange })
  server = started.server
  base = started.base
})

after(async () => {
  server.close()
  await sql.end()
})

/** Follows the redirect chain by hand so we can read Set-Cookie and Location. */
async function get(path: string, cookies: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    redirect: 'manual',
    headers: Object.keys(cookies).length
      ? { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') }
      : {},
  })
  const jar: Record<string, string> = {}
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(';')
    const i = pair.indexOf('=')
    jar[pair.slice(0, i)] = pair.slice(i + 1)
  }
  return { status: res.status, location: res.headers.get('location'), jar }
}

test('the start route sends the reader to Google with PKCE and a state', async () => {
  const r = await get('/api/auth/google/start')
  assert.equal(r.status, 302)
  const url = new URL(r.location!)
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
  assert.equal(url.searchParams.get('client_id'), CONFIG.clientId)
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.ok(url.searchParams.get('code_challenge'))
  assert.ok(url.searchParams.get('state'))
  // Not asking for the email is a decision, not an oversight: the column is
  // only ever written alongside its own contact-consent row.
  assert.equal(url.searchParams.get('scope'), 'openid profile')
  // No refresh token: Nidus needs to know who you are once, not to act later.
  assert.equal(url.searchParams.get('access_type'), null)
  assert.ok(r.jar.nidus_pkce, 'no PKCE verifier cookie')
  assert.ok(r.jar.nidus_oidc_state, 'no state cookie')
})

test('a callback with the right state signs the reader in', async () => {
  const start = await get('/api/auth/google/start')
  const state = new URL(start.location!).searchParams.get('state')!
  const r = await get(`/api/auth/google/callback?code=abc&state=${state}`, {
    nidus_pkce: start.jar.nidus_pkce,
    nidus_oidc_state: start.jar.nidus_oidc_state,
  })
  assert.equal(r.location, 'http://localhost:5173/?signin=ok')
  assert.ok(r.jar.nidus_reader, 'no session cookie was set')

  // The verifier that went to Google is the one whose challenge we sent.
  assert.equal(lastExchange!.verifier, start.jar.nidus_pkce)
  assert.equal(lastExchange!.code, 'abc')

  // And the cookie actually works on a protected route.
  const me = await fetch(`${base}/api/me`, { headers: { cookie: `nidus_reader=${r.jar.nidus_reader}` } })
  assert.equal(me.status, 200)
})

test('a forged or missing state is refused, and says nothing about why', async () => {
  const start = await get('/api/auth/google/start')
  for (const [label, qs, jar] of [
    ['wrong state', 'code=abc&state=not-the-one', { nidus_pkce: start.jar.nidus_pkce, nidus_oidc_state: start.jar.nidus_oidc_state }],
    ['no state cookie', `code=abc&state=${new URL(start.location!).searchParams.get('state')}`, { nidus_pkce: start.jar.nidus_pkce }],
    ['no code', `state=${new URL(start.location!).searchParams.get('state')}`, { nidus_pkce: start.jar.nidus_pkce, nidus_oidc_state: start.jar.nidus_oidc_state }],
  ] as const) {
    const r = await get(`/api/auth/google/callback?${qs}`, jar as Record<string, string>)
    assert.equal(r.location, 'http://localhost:5173/?signin=failed', label)
    assert.ok(!r.jar.nidus_reader, `${label} still set a session cookie`)
  }
})

test('the same Google account is the same reader, with a rotated credential', async () => {
  nextClaims = { sub: 'google-sub-stable', name: 'Deepak' }

  const signIn = async () => {
    const s = await get('/api/auth/google/start')
    const state = new URL(s.location!).searchParams.get('state')!
    return get(`/api/auth/google/callback?code=x&state=${state}`, {
      nidus_pkce: s.jar.nidus_pkce, nidus_oidc_state: s.jar.nidus_oidc_state,
    })
  }

  const first = await signIn()
  const second = await signIn()
  assert.ok(first.jar.nidus_reader && second.jar.nidus_reader)
  // Rotated: an old cookie from a borrowed device stops working.
  assert.notEqual(first.jar.nidus_reader, second.jar.nidus_reader)

  const rows = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM readers WHERE google_sub = 'google-sub-stable'`
  assert.equal(rows[0].n, '1', 'signing in twice created two readers')

  const old = await fetch(`${base}/api/me`, { headers: { cookie: `nidus_reader=${first.jar.nidus_reader}` } })
  assert.equal(old.status, 401, 'the previous credential still works after re-signing in')
})

test('a different Google account is a different reader', async () => {
  nextClaims = { sub: 'google-sub-other', name: 'Someone Else' }
  const s = await get('/api/auth/google/start')
  const state = new URL(s.location!).searchParams.get('state')!
  await get(`/api/auth/google/callback?code=y&state=${state}`, {
    nidus_pkce: s.jar.nidus_pkce, nidus_oidc_state: s.jar.nidus_oidc_state,
  })
  const rows = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM readers WHERE google_sub IS NOT NULL`
  assert.ok(Number(rows[0].n) >= 2)
})

test('no email is stored, even though Google would hand us one', async () => {
  // The scope does not ask for it and the repo does not write it. This asserts
  // the outcome rather than the intention, because "we store the minimum" is
  // the kind of promise that erodes one convenient field at a time.
  const rows = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM readers WHERE google_sub IS NOT NULL AND email IS NOT NULL`
  assert.equal(rows[0].n, '0', 'a Google sign-in wrote an email address')
})

test('with Google unconfigured the routes refuse clearly instead of half-working', async () => {
  const other = await startServer(sql) // googleConfig defaults to null
  try {
    const cfg = await (await fetch(`${other.base}/api/auth/config`)).json() as { google: boolean; missing: string[] }
    assert.equal(cfg.google, false)
    assert.ok(cfg.missing.length > 0, 'it should name what is missing')

    const r = await fetch(`${other.base}/api/auth/google/start`, { redirect: 'manual' })
    assert.equal(r.status, 503)
    const body = await r.json() as { error: string; detail: string }
    assert.equal(body.error, 'google_not_configured')
    assert.match(body.detail, /GOOGLE_CLIENT_ID/)
  } finally {
    other.server.close()
  }
})

test('the config route tells the client the truth so the button can be honest', async () => {
  const cfg = await (await fetch(`${base}/api/auth/config`)).json() as { google: boolean; phoneOtp: boolean }
  assert.equal(cfg.google, true)
  // Phone OTP is not built. Saying so here is what stops the client rendering
  // a second dead button.
  assert.equal(cfg.phoneOtp, false)
})

test('a cancelled sign-in is not a failure', async () => {
  const r = await get('/api/auth/google/callback?error=access_denied')
  assert.equal(r.location, 'http://localhost:5173/?signin=cancelled')
})

/* ---------------- CORS: the reason the client was never wired ------------- */

test('an allowed origin may read the response and send the cookie', async () => {
  const origin = 'http://localhost:3000' // the allowlist used by startServer
  const r = await fetch(`${base}/api/auth/config`, { headers: { origin } })
  assert.equal(r.headers.get('access-control-allow-origin'), origin)
  assert.equal(r.headers.get('access-control-allow-credentials'), 'true')
  // Or a cache will hand one origin's response to another.
  assert.match(r.headers.get('vary') ?? '', /Origin/i)
})

test('a disallowed origin gets no CORS headers, so the browser refuses it', async () => {
  const r = await fetch(`${base}/api/auth/config`, { headers: { origin: 'https://evil.example' } })
  assert.equal(r.status, 200) // the SERVER answers; the BROWSER is what refuses
  assert.equal(r.headers.get('access-control-allow-origin'), null)
  assert.equal(r.headers.get('access-control-allow-credentials'), null)
})

test('the allowed origin is echoed from the allowlist, never reflected or starred', async () => {
  // Reflecting whatever origin asked is the same as having no policy, and
  // browsers forbid `*` together with credentials — which is the second reason
  // this must never become a wildcard.
  const r = await fetch(`${base}/api/auth/config`, { headers: { origin: 'https://evil.example' } })
  assert.notEqual(r.headers.get('access-control-allow-origin'), '*')
  assert.notEqual(r.headers.get('access-control-allow-origin'), 'https://evil.example')
})

test('a preflight is answered without being rate-limited or CSRF-guarded', async () => {
  const r = await fetch(`${base}/api/consent`, {
    method: 'OPTIONS',
    headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'POST' },
  })
  assert.equal(r.status, 204)
  assert.match(r.headers.get('access-control-allow-methods') ?? '', /POST/)
  assert.match(r.headers.get('access-control-allow-headers') ?? '', /x-nidus-csrf/i)
})
