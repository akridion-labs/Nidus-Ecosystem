import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { freshDb, startServer, client } from './test-helpers.ts'
import * as repo from './db/repo.ts'
import type { Sql } from './db/client.ts'

/**
 * The shelf, and the one role.
 *
 * Two things are being protected here. The shelf is the reader's own record
 * and must not leak between readers — the same isolation the rest of the API
 * has, asserted again because a new table is a new chance to forget it. And
 * the admin role is a privilege boundary, so the tests that matter most are
 * the ones that try to cross it.
 */

let sql: Sql
let server: Server
let base: string

before(async () => {
  sql = await freshDb()
  const started = await startServer(sql)
  server = started.server
  base = started.base
})

after(async () => {
  server.close()
  await sql.end()
})

async function consented() {
  const c = client(base)
  const res = await c.call('POST', '/api/consent', { timezone: 'Asia/Kolkata', researchConsent: true })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return c
}

/** The reader id behind a client's cookie, for the role tests. */
async function readerIdOf(c: ReturnType<typeof client>) {
  const credential = c.cookies.get('nidus_reader')!
  const reader = await repo.readerByCredential(sql, credential)
  return reader!.id
}

test('a shelf round-trips', async () => {
  const c = await consented()
  const put = await c.call('PUT', '/api/shelf', {
    intents: [
      { workId: 'lean-startup', status: 'COMPLETED' },
      { workId: 'mom-test', status: 'OWNED' },
      { workId: 'quiet', status: 'PURCHASE_PIPELINE', note: 'November plan' },
    ],
  })
  assert.equal(put.status, 200)
  assert.equal(put.body.saved, 3)

  const got = await c.call('GET', '/api/shelf')
  assert.equal(got.body.intents.length, 3)
  const quiet = got.body.intents.find((i: { workId: string }) => i.workId === 'quiet')
  assert.equal(quiet.status, 'PURCHASE_PIPELINE')
  assert.equal(quiet.note, 'November plan')
})

test('changing your mind updates the row rather than adding a second one', async () => {
  const c = await consented()
  await c.call('PUT', '/api/shelf', { intents: [{ workId: 'mom-test', status: 'OWNED' }] })
  await c.call('PUT', '/api/shelf', { intents: [{ workId: 'mom-test', status: 'READING' }] })
  await c.call('PUT', '/api/shelf', { intents: [{ workId: 'mom-test', status: 'COMPLETED' }] })

  const got = await c.call('GET', '/api/shelf')
  const rows = got.body.intents.filter((i: { workId: string }) => i.workId === 'mom-test')
  // Three opinions about one book would leave the ranker to pick between them,
  // which is a decision nobody asked it to make.
  assert.equal(rows.length, 1, 'the same book appears more than once')
  assert.equal(rows[0].status, 'COMPLETED')
})

test('one reader cannot see or change another reader s shelf', async () => {
  const a = await consented()
  const b = await consented()
  await a.call('PUT', '/api/shelf', { intents: [{ workId: 'zero-to-one', status: 'OWNED' }] })

  const bsShelf = await b.call('GET', '/api/shelf')
  assert.deepEqual(bsShelf.body.intents, [], "B can see A's shelf")

  // And B deleting the same work id must not touch A's row.
  const del = await b.call('DELETE', '/api/shelf/zero-to-one')
  assert.equal(del.status, 404)
  const asShelf = await a.call('GET', '/api/shelf')
  assert.equal(asShelf.body.intents.length, 1, "B's delete reached A's shelf")
})

test('an unknown status is refused rather than stored', async () => {
  const c = await consented()
  const res = await c.call('PUT', '/api/shelf', {
    intents: [{ workId: 'mom-test', status: 'SORT_OF_READING' }],
  })
  assert.equal(res.status, 400)
})

test('deleting the reader takes the shelf with it', async () => {
  const c = await consented()
  const id = await readerIdOf(c)
  await c.call('PUT', '/api/shelf', { intents: [{ workId: 'grit', status: 'OWNED' }] })
  await c.call('DELETE', '/api/me')
  const [row] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM book_intents WHERE reader_id = ${id}`
  assert.equal(row.n, '0', 'shelf rows outlived the reader')
})

/* ================= the role ================= */

test('an ordinary reader is refused the admin route, and so is a stranger', async () => {
  const stranger = client(base)
  assert.equal((await stranger.call('GET', '/api/admin/overview')).status, 401)

  const c = await consented()
  const res = await c.call('GET', '/api/admin/overview')
  assert.equal(res.status, 403)
  // A 403 that described the route would confirm it exists and what it does.
  assert.deepEqual(Object.keys(res.body), ['error'])
})

test('an admin reaches it, and gets counts rather than anyone s rows', async () => {
  const c = await consented()
  await repo.setRole(sql, await readerIdOf(c), 'admin')

  const res = await c.call('GET', '/api/admin/overview')
  assert.equal(res.status, 200)
  // Whatever it reports, it must not be a reader's record. Counting is the
  // whole permitted operation: an operator does not need to read a stranger's
  // shelf to know how many strangers there are.
  const json = JSON.stringify(res.body)
  assert.ok(!json.includes('credential'), 'the overview leaked a credential field')
  assert.ok(!json.includes('work_id') && !json.includes('workId'), 'the overview leaked shelf rows')
})

test('no HTTP route grants the role — it is a database operation on purpose', async () => {
  const c = await consented()
  const id = await readerIdOf(c)

  // Everything a reader can send that might plausibly carry a role.
  for (const [method, path, body] of [
    ['POST', '/api/consent', { timezone: 'Asia/Kolkata', researchConsent: true, role: 'admin' }],
    ['PUT', '/api/shelf', { intents: [{ workId: 'grit', status: 'OWNED' }], role: 'admin' }],
    ['POST', '/api/goal', { daysPerWeek: 2, sessionMinutes: 10, role: 'admin' }],
  ] as const) {
    await c.call(method, path, body)
  }

  const [row] = await sql<{ role: string }[]>`SELECT role FROM readers WHERE id = ${id}`
  assert.equal(row.role, 'reader', 'a request body changed a role')
})

test('the role is read from the database on every request, not from the cookie', async () => {
  const c = await consented()
  const id = await readerIdOf(c)
  await repo.setRole(sql, id, 'admin')
  assert.equal((await c.call('GET', '/api/admin/overview')).status, 200)

  // Revoked mid-session, with the same cookie still in hand.
  await repo.setRole(sql, id, 'reader')
  assert.equal(
    (await c.call('GET', '/api/admin/overview')).status, 403,
    'the cookie kept working after the role was revoked',
  )
})

test('the database refuses a role nobody defined', async () => {
  const c = await consented()
  const id = await readerIdOf(c)
  await assert.rejects(
    () => sql`UPDATE readers SET role = 'superuser' WHERE id = ${id}`,
    /readers_role_known/,
  )
})
