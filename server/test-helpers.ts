import { connect } from './db/client.ts'
import { migrate } from './db/migrate.ts'
import { createApp } from './http/app.ts'
import type { Sql } from './db/client.ts'
import type { Server } from 'node:http'

export async function freshDb(): Promise<Sql> {
  const sql = connect(process.env.TEST_DATABASE_URL)
  await migrate(sql)
  await sql`TRUNCATE readers, audit_log RESTART IDENTITY CASCADE`
  return sql
}

export async function startServer(
  sql: Sql,
  operatorToken?: string,
  limits?: { consentPerMinute?: number; writesPerMinute?: number; operatorPerMinute?: number },
) {
  // Tests share one loopback address, so production limits would throttle the
  // suite rather than the attacker. The limiter itself has its own test.
  const app = createApp({
    sql, secureCookies: false, allowedOrigins: ['http://localhost:3000'], operatorToken,
    rankerVersion: 'test-ranker-1',
    limits: limits ?? { consentPerMinute: 10_000, writesPerMinute: 10_000, operatorPerMinute: 10_000 },
  })
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  const { port } = server.address() as { port: number }
  return { server, base: `http://127.0.0.1:${port}` }
}

/** A browser-ish client: keeps cookies and echoes the CSRF cookie as a header. */
export function client(base: string) {
  const jar = new Map<string, string>()
  return {
    cookies: jar,
    async call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
      const headers: Record<string, string> = { 'content-type': 'application/json', ...extra }
      if (jar.size > 0) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
      const csrf = jar.get('nidus_csrf')
      if (csrf && !('x-nidus-csrf' in extra)) headers['x-nidus-csrf'] = csrf
      const res = await fetch(base + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      })
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';')
        const idx = pair.indexOf('=')
        const name = pair.slice(0, idx)
        const value = pair.slice(idx + 1)
        if (value === '') jar.delete(name)
        else jar.set(name, value)
      }
      const text = await res.text()
      let parsed: unknown = null
      try { parsed = text ? JSON.parse(text) : null } catch { parsed = { nonJson: text.slice(0, 80) } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { status: res.status, body: parsed as any }
    },
  }
}
