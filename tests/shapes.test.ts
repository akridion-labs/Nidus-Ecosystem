import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catalogue } from '../src/data/catalogue.ts'
import { ReadingBrief, SHAPES } from '../src/domain/contracts.ts'
import { rank, isEligible } from '../src/domain/ranker.ts'
import { SHELVES, shelfItems } from '../src/domain/shelves.ts'

const brief = (over = {}) =>
  ReadingBrief.parse({ purpose: 'curiosity', mode: 'enjoy', language: 'en', sessionMinutes: 20, ...over })

test('nothing is excluded until the reader excludes it', () => {
  // The default must be empty. A filter that quietly removes books nobody
  // asked it to remove is the opposite of showing your working, and it would
  // be invisible in every other test.
  assert.deepEqual(brief().avoid, [])
  for (const item of catalogue.items) {
    const r = isEligible(item, brief())
    assert.notEqual(r.ok === false && r.kind, 'shape', `${item.work.id} excluded with an empty avoid list`)
  }
})

test('excluding a shape removes exactly the books tagged with it, and says why', () => {
  for (const shape of SHAPES) {
    const tagged = catalogue.items.filter((i) => i.profile.shapes.includes(shape))
    const b = brief({ avoid: [shape] })
    for (const item of catalogue.items) {
      const r = isEligible(item, b)
      const excludedForShape = r.ok === false && r.kind === 'shape'
      assert.equal(excludedForShape, tagged.includes(item), `${item.work.id} / ${shape}`)
      if (excludedForShape) assert.match(r.reason, /you ruled out/)
    }
  }
})

test('a shape is never silently dropped: the exclusion is reported in the result', () => {
  const tagged = catalogue.items.filter((i) => i.profile.shapes.includes('suspense'))
  if (tagged.length === 0) return
  const result = rank(catalogue, brief({ avoid: ['suspense'] }))
  for (const item of tagged) {
    const row = result.excluded.find((e) => e.item.work.id === item.work.id)
    assert.ok(row, `${item.work.id} vanished instead of being reported`)
    assert.equal(row.kind, 'shape')
  }
  // And it must never still be recommended.
  for (const d of result.decisions) {
    assert.ok(!tagged.some((t) => t.work.id === d.workId), `${d.workId} was ruled out and offered anyway`)
  }
})

test('excluding a shape never empties the catalogue', () => {
  // The honest failure mode of a filter is an empty page with no explanation.
  const b = brief({ avoid: [...SHAPES] })
  const result = rank(catalogue, b)
  assert.ok(result.decisions.length > 0, 'ruling out every shape left nothing to read')
})

test('every shelf has something on it', () => {
  // Science fiction showed a deliberate zero for weeks, which was the honest
  // answer. Now that books exist for it, an empty shelf would mean a topic
  // typo rather than an honest gap - and this is what would notice.
  for (const shelf of SHELVES) {
    assert.ok(shelfItems(catalogue, shelf).length > 0, `${shelf.name} is empty`)
  }
})

test('the travel shelf is reachable and is really travel', () => {
  const shelf = SHELVES.find((s) => s.id === 'the-journey')!
  const ids = shelfItems(catalogue, shelf).map((i) => i.work.id)
  for (const id of ['invisible-cities', 'railway-bazaar', 'city-of-djinns', 'in-patagonia']) {
    assert.ok(ids.includes(id), `${id} should be on the journey shelf`)
  }
})
