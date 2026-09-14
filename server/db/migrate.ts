import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Sql } from './client.ts'
import { connect } from './client.ts'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(here, '..', 'migrations')

/** Applied migrations are recorded, so running this twice is a no-op. */
export async function migrate(sql: Sql) {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
  const applied = new Set(
    (await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map((r) => r.name),
  )
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort()
  const ran: string[] = []
  for (const file of files) {
    if (applied.has(file)) continue
    const body = await readFile(join(MIGRATIONS, file), 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(body)
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`
    })
    ran.push(file)
  }
  return ran
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sql = connect()
  const ran = await migrate(sql)
  console.log(ran.length ? `applied: ${ran.join(', ')}` : 'nothing to apply')
  await sql.end()
}
