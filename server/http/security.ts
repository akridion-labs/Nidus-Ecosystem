import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export const READER_COOKIE = 'nidus_reader'
export const CSRF_COOKIE = 'nidus_csrf'
export const CSRF_HEADER = 'x-nidus-csrf'

export function cookieOptions(secure: boolean, maxAgeDays: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeDays * 24 * 60 * 60 * 1000,
  }
}

/** The CSRF cookie is deliberately readable by script; the reader cookie is not. */
export function csrfCookieOptions(secure: boolean, maxAgeDays: number) {
  return { ...cookieOptions(secure, maxAgeDays), httpOnly: false }
}

export function newCsrfToken() {
  return randomBytes(24).toString('base64url')
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Double-submit CSRF plus an Origin check. Either alone is weaker than both:
 * the Origin header can be absent, and a cookie alone can be replayed by a
 * form post from another site.
 */
export function csrfGuard(allowedOrigins: string[], exempt: string[] = []) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()

    const origin = req.get('origin')
    // Session-establishing routes cannot double-submit: no cookie exists yet, and
    // setting one before consent would be tracking before permission. They keep
    // the Origin check and the rate limit. The residual risk is that a forged
    // request creates an EMPTY record for a browser — no data is read or changed.
    if (exempt.includes(req.path)) {
      if (origin && !allowedOrigins.includes(origin)) {
        return res.status(403).json({ error: 'origin_not_allowed' })
      }
      return next()
    }

    if (origin && !allowedOrigins.includes(origin)) {
      return res.status(403).json({ error: 'origin_not_allowed' })
    }

    const cookie = req.cookies?.[CSRF_COOKIE]
    const header = req.get(CSRF_HEADER)
    if (!cookie || !header || !safeEqual(cookie, header)) {
      return res.status(403).json({ error: 'csrf_failed' })
    }
    next()
  }
}

/**
 * ponytail: in-process fixed-window counter, per IP and route. Enough for a
 * 20-30 person pilot on one instance. Move to a shared store the day there is
 * more than one instance, or it counts each instance separately.
 */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>()
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.method}:${req.path}`
    const now = Date.now()
    const entry = hits.get(key)
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }
    if (entry.count >= max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      return res.status(429).json({ error: 'rate_limited' })
    }
    entry.count += 1
    next()
  }
}

/** Minimal hardening headers. A CDN or proxy may add more in front. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('Referrer-Policy', 'no-referrer')
  res.set('X-Frame-Options', 'DENY')
  res.set('Cache-Control', 'no-store')
  next()
}
