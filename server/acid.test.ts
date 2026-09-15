import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { connect } from './db/client.ts'
import type { Sql } from './db/client.ts'
import { migrate } from './db/migrate.ts'
import * as repo from './db/repo.ts'

/**
 * ACID, demonstrated rather than asserted in prose.
 *
 * Three of the four are properties of this schema plus PostgreSQL and can be
 * shown with a test. Durability is a property of the deployment — WAL settings,
 * fsync, and a restore somebody has actually performed — so the last section
 * checks the settings and is explicit that a passing test is not a backup.
 */

let sql: Sql
let other: Sql   // a second connection, for isolation tests

before(async () => {
  sql = connect(process.env.TEST_DATABASE_URL)
  other = connect(process.env.TEST_DATABASE_URL)
  await migrate(sql)
  await sql`TRUNCATE readers, audit_log RESTART IDENTITY CASCADE`
})

after(async () => { await sql.end(); await other.end() })

async function newReader(tz = 'Asia/Kolkata') {
  const credential = repo.newCredential()
  const id = await repo.createReaderWithConsent(sql, {
    credential, timezone: tz, consentVersion: 'v-test',
    disclosedFields: ['a', 'b'], researchConsent: true, contactConsent: false,
    retentionDays: 30,
  })
  return { id, credential }
}

/* ===================== A — Atomicity ===================== */

test('A: a failed consent transaction leaves no reader behind', async () => {
  const before = (await sql`SELECT count(*)::int AS n FROM readers`)[0].n

  // Same shape as createReaderWithConsent, but the second statement is invalid.
  // Either both rows exist or neither does; there is no half-registered reader.
  await assert.rejects(() => sql.begin(async (tx) => {
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO readers (credential_hash, timezone) VALUES (${repo.hashCredential('x')}, 'UTC')
      RETURNING id`
    await tx`
      INSERT INTO consent_records (reader_id, consent_version, disclosed_fields, research_consent)
      VALUES (${r.id}, ${'v'}, ${tx.json(['a'])}, true)`
    // A CHECK violation in the same transaction: everything above must unwind.
    await tx`
      INSERT INTO reading_goals (reader_id, days_per_week, session_minutes, effective_from)
      VALUES (${r.id}, 99, 20, '2026-01-01')`
  }))

  const after = (await sql`SELECT count(*)::int AS n FROM readers`)[0].n
  assert.equal(after, before, 'the reader row must have rolled back with the consent row')
  assert.equal((await sql`SELECT count(*)::int AS n FROM readers WHERE timezone = 'UTC'`)[0].n, 0)
})

test('A: a successful consent writes reader, consent and audit together or not at all', async () => {
  const { id } = await newReader()
  assert.equal((await sql`SELECT count(*)::int AS n FROM consent_records WHERE reader_id = ${id}`)[0].n, 1)
  assert.equal((await sql`SELECT count(*)::int AS n FROM audit_log WHERE reader_id = ${id} AND action = 'consent.granted'`)[0].n, 1)
})

test('A: a rolled-back batch of check-ins leaves none of them', async () => {
  const { id } = await newReader()
  await assert.rejects(() => sql.begin(async (tx) => {
    await tx`INSERT INTO reading_sessions (reader_id, local_day, minutes) VALUES (${id}, '2026-01-01', 10)`
    await tx`INSERT INTO reading_sessions (reader_id, local_day, minutes) VALUES (${id}, '2026-01-02', 10)`
    await tx`INSERT INTO reading_sessions (reader_id, local_day, minutes) VALUES (${id}, '2026-01-03', 9999)` // violates CHECK
  }))
  assert.equal((await sql`SELECT count(*)::int AS n FROM reading_sessions WHERE reader_id = ${id}`)[0].n, 0)
})

/* ===================== C — Consistency ===================== */

test('C: the database refuses values the domain considers impossible', async () => {
  const { id } = await newReader()
  const rejected: string[] = []
  const tryInsert = async (label: string, run: () => Promise<unknown>) => {
    try { await run(); } catch { rejected.push(label) }
  }
  await tryInsert('days_per_week=9', () =>
    sql`INSERT INTO reading_goals (reader_id, days_per_week, session_minutes, effective_from)
        VALUES (${id}, 9, 20, '2026-01-01')`)
  await tryInsert('session_minutes=0', () =>
    sql`INSERT INTO reading_goals (reader_id, days_per_week, session_minutes, effective_from)
        VALUES (${id}, 3, 0, '2026-01-02')`)
  await tryInsert('mode=shouting', () =>
    sql`INSERT INTO journeys (reader_id, work_id, edition_id, mode, purpose, language, ranker_version, catalogue_version)
        VALUES (${id}, 'w', 'e', 'shouting', 'p', 'en', 'r', 'c')`)
  await tryInsert('feedback kind=delighted', () =>
    sql`INSERT INTO feedback (reader_id, kind) VALUES (${id}, 'delighted')`)
  await tryInsert('journey status=vibing', () =>
    sql`INSERT INTO journeys (reader_id, work_id, edition_id, mode, purpose, language, ranker_version, catalogue_version, status)
        VALUES (${id}, 'w', 'e', 'apply', 'p', 'en', 'r', 'c', 'vibing')`)

  assert.deepEqual(rejected.sort(), [
    'days_per_week=9', 'feedback kind=delighted', 'journey status=vibing',
    'mode=shouting', 'session_minutes=0',
  ])
})

test('C: a row cannot belong to a reader who does not exist', async () => {
  await assert.rejects(() =>
    sql`INSERT INTO reading_sessions (reader_id, local_day, minutes)
        VALUES ('00000000-0000-0000-0000-000000000000', '2026-01-01', 10)`)
})

test('C: deleting a reader leaves no orphan in any child table', async () => {
  const { id } = await newReader()
  const jid = await repo.saveJourney(sql, id, {
    workId: 'w', editionId: 'e', mode: 'apply', purpose: 'company-building',
    language: 'en', rankerVersion: 'r', catalogueVersion: 'c',
  })
  await repo.setGoal(sql, id, { daysPerWeek: 3, sessionMinutes: 20, effectiveFrom: '2026-01-01' })
  await repo.checkIn(sql, id, { day: '2026-01-01', minutes: 20, journeyId: jid })
  const fid = await repo.addFeedback(sql, id, { kind: 'boring', journeyId: jid })
  await repo.proposeAdaptation(sql, id, {
    journeyId: jid, feedbackId: fid, reason: 'r',
    before: { daysPerWeek: 3 }, after: { daysPerWeek: 2 }, rankerVersion: 'r',
  })

  assert.equal(await repo.deleteReader(sql, id), true)

  // Enumerated from the schema rather than hand-listed, so a table added later
  // without a cascading reader_id fails this test instead of leaking quietly.
  const tables = await sql<{ table_name: string }[]>`
    SELECT c.relname AS table_name
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE a.attname = 'reader_id' AND c.relkind = 'r' AND n.nspname = 'public'
      AND c.relname <> 'audit_log'`
  assert.ok(tables.length >= 5, `expected several child tables, found ${tables.length}`)
  for (const { table_name } of tables) {
    const rows = await sql`SELECT 1 FROM ${sql(table_name)} WHERE reader_id = ${id}`
    assert.equal(rows.length, 0, `${table_name} kept an orphan`)
  }
})

test('C: the audit trail deliberately survives the reader, carrying no identity', async () => {
  const { id } = await newReader()
  await repo.deleteReader(sql, id)
  const rows = await sql<{ reader_id: string | null }[]>`
    SELECT reader_id FROM audit_log WHERE action = 'data.deleted'`
  assert.ok(rows.length > 0, 'a deletion must be provable')
  assert.ok(rows.every((r) => r.reader_id === null), 'and must not name who it was')
})

/* ===================== I — Isolation ===================== */

test('I: an uncommitted write is invisible to another connection', async () => {
  const { id } = await newReader()
  let sawInside = 0
  let sawOutside = 0

  await sql.begin(async (tx) => {
    await tx`INSERT INTO feedback (reader_id, kind) VALUES (${id}, 'useful')`
    sawInside = (await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM feedback WHERE reader_id = ${id}`)[0].n
    sawOutside = (await other<{ n: number }[]>`SELECT count(*)::int AS n FROM feedback WHERE reader_id = ${id}`)[0].n
  })

  assert.equal(sawInside, 1, 'the writer sees its own work')
  assert.equal(sawOutside, 0, 'nobody else sees it until it commits')
  const afterCommit = (await other<{ n: number }[]>`SELECT count(*)::int AS n FROM feedback WHERE reader_id = ${id}`)[0].n
  assert.equal(afterCommit, 1)
})

test('I: concurrent check-ins on the same day cannot both create a row', async () => {
  const { id } = await newReader()
  const results = await Promise.all(
    Array.from({ length: 8 }, () => repo.checkIn(sql, id, { day: '2026-02-02', minutes: 15 })),
  )
  assert.equal(results.filter((r) => r.created).length, 1, 'exactly one insert wins')
  assert.equal((await sql`SELECT count(*)::int AS n FROM reading_sessions WHERE reader_id = ${id}`)[0].n, 1)
})

test('I: two readers writing at once never touch each other rows', async () => {
  const a = await newReader()
  const b = await newReader()
  await Promise.all([
    ...Array.from({ length: 10 }, (_, i) => repo.addFeedback(sql, a.id, { kind: 'useful', note: `a${i}` })),
    ...Array.from({ length: 10 }, (_, i) => repo.addFeedback(sql, b.id, { kind: 'boring', note: `b${i}` })),
  ])
  const aRows = await sql<{ note: string }[]>`SELECT note FROM feedback WHERE reader_id = ${a.id}`
  const bRows = await sql<{ note: string }[]>`SELECT note FROM feedback WHERE reader_id = ${b.id}`
  assert.equal(aRows.length, 10)
  assert.equal(bRows.length, 10)
  assert.ok(aRows.every((r) => r.note.startsWith('a')))
  assert.ok(bRows.every((r) => r.note.startsWith('b')))
})

test('I: a concurrent decision on one adaptation is applied once', async () => {
  const { id } = await newReader()
  const aid = await repo.proposeAdaptation(sql, id, {
    reason: 'r', before: { daysPerWeek: 3 }, after: { daysPerWeek: 2 }, rankerVersion: 'r',
  })
  const results = await Promise.all([
    repo.decideAdaptation(sql, id, aid, true),
    repo.decideAdaptation(sql, id, aid, false),
    repo.decideAdaptation(sql, id, aid, true),
  ])
  assert.equal(results.filter(Boolean).length, 1, 'only the first decision counts')
})

/* ===================== D — Durability ===================== */

test('D: the server is configured to survive a crash, and this is not a backup test', async () => {
  const [settings] = await sql<{ fsync: string; synchronous_commit: string; full_page_writes: string; wal_level: string }[]>`
    SELECT current_setting('fsync')               AS fsync,
           current_setting('synchronous_commit')  AS synchronous_commit,
           current_setting('full_page_writes')    AS full_page_writes,
           current_setting('wal_level')           AS wal_level`

  assert.equal(settings.fsync, 'on', 'fsync off means a crash can lose committed data')
  assert.equal(settings.full_page_writes, 'on', 'protects against torn pages after a crash')
  assert.ok(['on', 'remote_apply', 'remote_write', 'local'].includes(settings.synchronous_commit),
    `synchronous_commit is "${settings.synchronous_commit}" — "off" trades durability for speed`)
  assert.ok(['replica', 'logical', 'minimal'].includes(settings.wal_level))

  // Durability that matters is a restore somebody has performed. A green test
  // here proves the server is configured correctly and proves nothing about
  // whether a backup exists or can be restored. See the deployment strategy.
})

test('D: a committed write is readable from a brand new connection', async () => {
  const { id } = await newReader()
  await repo.addFeedback(sql, id, { kind: 'useful', note: 'committed' })
  const fresh = connect(process.env.TEST_DATABASE_URL)
  try {
    const rows = await fresh<{ note: string }[]>`SELECT note FROM feedback WHERE reader_id = ${id}`
    assert.deepEqual(rows.map((r) => r.note), ['committed'])
  } finally { await fresh.end() }
})
