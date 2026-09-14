import { connect } from './db/client.ts'
import { migrate } from './db/migrate.ts'
import { createApp } from './http/app.ts'

const sql = connect()
await migrate(sql)

const app = createApp({
  sql,
  secureCookies: process.env.NODE_ENV === 'production',
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
  operatorToken: process.env.OPERATOR_TOKEN,
  rankerVersion: process.env.RANKER_VERSION ?? 'nidus-ranker-0.2.0-pilot',
})

// Loopback by default, deliberately. RUNBOOK 07 on AKRIDION-AI-01:
// never bind the first deployment to 0.0.0.0, and no router port-forward.
const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 8787)
app.listen(port, host, () => console.log(`[nidus] listening on http://${host}:${port}`))
