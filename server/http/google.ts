import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Express, Request, Response, NextFunction } from 'express'
import type { Sql } from '../db/client.ts'
import * as repo from '../db/repo.ts'
import { READER_COOKIE, CSRF_COOKIE, cookieOptions, csrfCookieOptions, newCsrfToken } from './security.ts'

/**
 * Sign in with Google. Authorization code + PKCE, keyed on `sub`.
 *
 * WHAT THIS IS NOT
 *
 * It is not a new session mechanism. Google's only job is to tell us WHICH
 * reader this is; after that the existing credential cookie carries the session
 * exactly as it does for an invite code, and `requireReader` is unchanged. A
 * second session system would be a second place for session bugs to live.
 *
 * THE FOUR RULES, enforced here rather than trusted
 *
 * 1. Keyed on `sub`, never on the email address. People change their email;
 *    `sub` is the stable subject identifier. Keying on email is how two
 *    accounts become one person's mess — and worse, how someone who acquires a
 *    recycled address inherits a stranger's shelf.
 * 2. The email is not stored at all here. The column is nullable and is written
 *    only alongside its own contact-consent row (migration 0002). Google hands
 *    us an email on every sign-in; taking it because it was offered is how
 *    "we store the minimum" quietly stops being true.
 * 3. PKCE, and `state` compared in constant time. The verifier and state live
 *    in short-lived httpOnly cookies rather than a table: they are needed for
 *    ninety seconds and a table would be one more thing to expire.
 * 4. The ID token's signature is verified by Google, not by us — we exchange
 *    the code over TLS at the token endpoint and read the claims from that
 *    response. We never accept an ID token sent to us by a browser.
 */

const VERIFIER_COOKIE = 'nidus_pkce'
const STATE_COOKIE = 'nidus_oidc_state'

export type GoogleConfig = {
  clientId: string
  clientSecret: string
  /** Must match a redirect URI registered in the Google Cloud console exactly. */
  redirectUri: string
  /** Where to send the reader once they are signed in. */
  appUrl: string
}

/** Reads the config from the environment, or null when it is not set up. */
export function googleConfigFromEnv(env: NodeJS.ProcessEnv): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim()
  const redirectUri = env.GOOGLE_REDIRECT_URI?.trim()
  if (!clientId || !clientSecret || !redirectUri) return null
  return { clientId, clientSecret, redirectUri, appUrl: env.APP_URL?.trim() || 'http://localhost:5173' }
}

const b64url = (b: Buffer) => b.toString('base64url')
const challengeFor = (verifier: string) => b64url(createHash('sha256').update(verifier).digest())

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  // Length is not secret here, but comparing unequal lengths would throw.
  return x.length === y.length && timingSafeEqual(x, y)
}

/** A short-lived cookie for the handful of seconds the round trip takes. */
const shortCookie = (secure: boolean) => ({
  httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: 10 * 60 * 1000,
})

export function mountGoogleAuth(opts: {
  app: Express
  sql: Sql
  config: GoogleConfig | null
  secure: boolean
  retentionDays: number
  /** Injectable so the tests never touch the network. */
  exchange?: typeof exchangeCodeWithGoogle
}) {
  const { app, sql, config, secure, retentionDays } = opts
  const exchange = opts.exchange ?? exchangeCodeWithGoogle

  /**
   * So the client can show an honest button instead of a dead one.
   *
   * A sign-in button that looks live and goes nowhere is the single worst
   * control this product could ship, because somebody types a real password
   * into it. The client reads this and says what is missing instead.
   */
  app.get('/api/auth/config', (_req, res) => {
    res.json({
      google: config !== null,
      // Named so the message can be specific rather than "something is wrong".
      missing: config === null
        ? ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']
            .filter((k) => !process.env[k]?.trim())
        : [],
      phoneOtp: false,
    })
  })

  const requireConfig = (_req: Request, res: Response, next: NextFunction) => {
    if (!config) {
      return res.status(503).json({
        error: 'google_not_configured',
        detail: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI, then restart the server.',
      })
    }
    next()
  }

  app.get('/api/auth/google/start', requireConfig, (_req, res) => {
    const verifier = b64url(randomBytes(32))
    const state = b64url(randomBytes(16))
    res.cookie(VERIFIER_COOKIE, verifier, shortCookie(secure))
    res.cookie(STATE_COOKIE, state, shortCookie(secure))

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', config!.clientId)
    url.searchParams.set('redirect_uri', config!.redirectUri)
    url.searchParams.set('response_type', 'code')
    // openid gives us `sub`. We ask for a name so the page can greet someone,
    // and deliberately NOT for email: see rule 2 above.
    url.searchParams.set('scope', 'openid profile')
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', challengeFor(verifier))
    url.searchParams.set('code_challenge_method', 'S256')
    // Nidus holds no refresh token and asks for no offline access: it needs to
    // know who you are once, not to act for you later.
    res.redirect(url.toString())
  })

  app.get('/api/auth/google/callback', requireConfig, (req, res, next) => {
    void (async () => {
      const { code, state, error } = req.query as Record<string, string | undefined>
      const verifier = req.cookies?.[VERIFIER_COOKIE]
      const expected = req.cookies?.[STATE_COOKIE]
      res.clearCookie(VERIFIER_COOKIE, { path: '/' })
      res.clearCookie(STATE_COOKIE, { path: '/' })

      if (error) return res.redirect(`${config!.appUrl}/?signin=cancelled`)
      if (!code || !state || !verifier || !expected || !sameString(state, expected)) {
        // Deliberately one message for every failure here. Telling a caller
        // WHICH part of the handshake it got wrong is free help for someone
        // probing it.
        return res.redirect(`${config!.appUrl}/?signin=failed`)
      }

      const claims = await exchange(config!, code, verifier)
      if (!claims) return res.redirect(`${config!.appUrl}/?signin=failed`)

      const credential = repo.newCredential()
      await repo.linkOrCreateGoogleReader(sql, {
        googleSub: claims.sub,
        displayName: claims.name ?? null,
        credential,
        retentionDays,
      })
      res.cookie(READER_COOKIE, credential, cookieOptions(secure, retentionDays))
      res.cookie(CSRF_COOKIE, newCsrfToken(), csrfCookieOptions(secure, retentionDays))
      res.redirect(`${config!.appUrl}/?signin=ok`)
    })().catch(next)
  })
}

export type GoogleClaims = { sub: string; name?: string }

/**
 * Exchanges the code at Google's token endpoint and reads the ID token claims.
 *
 * The ID token arrives over TLS directly from Google in response to a request
 * carrying our client secret, so its signature has already done its job by the
 * time we see it: nobody else could have produced this response. That is why
 * the payload is decoded rather than re-verified — and why an ID token arriving
 * from a BROWSER would have to be verified properly and is never accepted here.
 */
export async function exchangeCodeWithGoogle(
  config: GoogleConfig,
  code: string,
  verifier: string,
): Promise<GoogleClaims | null> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  })
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!r.ok) return null
  const json = (await r.json()) as { id_token?: string }
  if (!json.id_token) return null

  const payload = json.id_token.split('.')[1]
  if (!payload) return null
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as
    { sub?: string; name?: string; aud?: string; iss?: string }

  // Belt and braces: even from Google's own endpoint, check the token is for us.
  if (!claims.sub) return null
  if (claims.aud !== config.clientId) return null
  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') return null
  return { sub: claims.sub, name: claims.name }
}
