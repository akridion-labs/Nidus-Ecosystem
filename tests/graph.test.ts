import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catalogue } from '../src/data/catalogue.ts'
import { readingPath } from '../src/domain/path.ts'
import { ReadingBrief } from '../src/domain/contracts.ts'

/**
 * The prerequisite graph. `readingPath` walks it to produce "read this first",
 * which makes it the one structure in Nidus where a data mistake becomes a
 * wrong instruction to a reader rather than a wrong score.
 *
 * It is already cycle-SAFE: the walk carries a seen-set, so a cycle cannot hang
 * the page. It was not cycle-FREE, and nothing checked. A cycle would have
 * produced a silently truncated reading order - A before B before A, with one
 * of them quietly dropped - which is worse than a crash, because it looks like
 * an answer.
 */
const edges = () =>
  catalogue.items.flatMap((i) => i.profile.prerequisites.map((p) => [i.work.id, p] as const))

test('every prerequisite points at a book that exists', () => {
  // A typo here does not fail loudly: the walk skips unknown ids, so the step
  // just never appears and the reader is told to start in the middle.
  const ids = new Set(catalogue.items.map((i) => i.work.id))
  for (const [from, to] of edges()) {
    assert.ok(ids.has(to), `${from} requires "${to}", which is not in the catalogue`)
  }
})

test('the prerequisite graph is acyclic', () => {
  const out = new Map<string, string[]>()
  for (const i of catalogue.items) out.set(i.work.id, i.profile.prerequisites)

  // Three-colour DFS. White is the absence of an entry in the map, so it needs
  // no constant of its own.
  const GREY = 1, BLACK = 2
  const colour = new Map<string, number>()
  const stack: string[] = []
  const visit = (id: string): string[] | null => {
    if (colour.get(id) === GREY) return [...stack.slice(stack.indexOf(id)), id]
    if (colour.get(id) === BLACK) return null
    colour.set(id, GREY)
    stack.push(id)
    for (const next of out.get(id) ?? []) {
      const cycle = visit(next)
      if (cycle) return cycle
    }
    stack.pop()
    colour.set(id, BLACK)
    return null
  }
  for (const id of out.keys()) {
    const cycle = visit(id)
    assert.equal(cycle, null, `prerequisite cycle: ${cycle?.join(' -> ')}`)
  }
})

test('no book is its own prerequisite', () => {
  for (const [from, to] of edges()) {
    assert.notEqual(from, to, `${from} requires itself`)
  }
})

test('a reading path never repeats a book and never includes its target twice', () => {
  const brief = ReadingBrief.parse({
    purpose: 'company-building', mode: 'apply', language: 'en', sessionMinutes: 20,
  })
  for (const item of catalogue.items) {
    const ids = readingPath(catalogue, item.work.id, brief).map((s) => s.item.work.id)
    assert.equal(new Set(ids).size, ids.length, `${item.work.id} path repeats a book: ${ids.join(', ')}`)
  }
})

test('a cycle in the data cannot hang the walk', async () => {
  // Proving the safety property rather than trusting it. Two books that each
  // claim to require the other: the walk must return, and must not loop.
  const { loadCatalogue } = await import('../src/domain/catalogue.ts')
  const work = (id: string) => ({ id, title: id, author: 'A', firstPublished: 2000, fiction: false, provenance: { source: 'test', confirmedAt: null } })
  const ed = (id: string) => ({ id: `${id}-en`, workId: id, language: 'en', isbn13: null, format: 'print', pages: null, provenance: { source: 'test', confirmedAt: null } })
  const prof = (id: string, req: string[]) => ({
    workId: id, inOneLine: 'x', modes: ['apply'], topics: ['t'], conceptualDifficulty: 1,
    typicalSessionMinutes: 10, actionability: 1, emotionalIntensity: 1, prerequisites: req,
    provenance: { source: 'test-editorial', confirmedAt: null },
  })
  const looped = loadCatalogue(
    [work('a'), work('b')], [ed('a'), ed('b')], [prof('a', ['b']), prof('b', ['a'])],
  )
  const brief = ReadingBrief.parse({ purpose: 'craft', mode: 'apply', language: 'en', sessionMinutes: 10 })
  const path = readingPath(looped, 'a', brief)
  assert.ok(Array.isArray(path), 'the walk did not return')
  const ids = path.map((st) => st.item.work.id)
  // The bug this caught: the walk never hung, but the OUTPUT read
  // "b, a, b" - the same book on both sides of the one asked about, because b
  // was a prerequisite of a and, via the cycle, also unlocked by it.
  assert.equal(new Set(ids).size, ids.length, `a 2-cycle repeated a step: ${ids.join(' -> ')}`)
})
