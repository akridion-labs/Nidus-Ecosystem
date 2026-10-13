import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ReadingBrief } from '../src/domain/contracts.ts'
import type { ReadingBrief as Brief } from '../src/domain/contracts.ts'
import { loadCatalogue } from '../src/domain/catalogue.ts'
import { seedWorks, seedEditions, seedProfiles, PUBLIC_DOMAIN_WORKS } from '../src/data/catalogue.seed.ts'
import { readingPath, findRoutes } from '../src/domain/path.ts'

const loaded = loadCatalogue(seedWorks, seedEditions, seedProfiles)
const item = (id: string) => loaded.items.find((i) => i.work.id === id)!

const brief = (over: Partial<Brief> = {}): Brief =>
  ReadingBrief.parse({
    purpose: 'company-building', mode: 'apply', language: 'en', sessionMinutes: 20, ...over,
  })

test('the path puts what a book assumes before the book', () => {
  // Guide to Investing assumes Cashflow Quadrant, which assumes Rich Dad Poor
  // Dad. Deepest first is the order a reader would actually go in.
  const steps = readingPath(loaded, 'guide-to-investing', brief())
  assert.deepEqual(
    steps.map((s) => s.item.work.id),
    ['rich-dad', 'cashflow-quadrant', 'guide-to-investing'],
  )
  assert.equal(steps.at(-1)!.status, 'now')
})

test('a prerequisite already finished is context, not homework', () => {
  const steps = readingPath(loaded, 'cashflow-quadrant', brief({
    intents: [{ workId: 'rich-dad', status: 'COMPLETED' }],
  }))
  const first = steps[0]
  assert.equal(first.item.work.id, 'rich-dad')
  assert.equal(first.status, 'done')
  assert.match(first.why, /Already read/)
})

test('what a book opens appears after it, and is marked later when the stage is wrong', () => {
  const early = readingPath(loaded, 'lean-startup', brief({
    founderContext: { stage: 'VALIDATE', currentDecision: '', actionHoursPerWeek: 2, activeApplyBooks: 0 },
  }))
  const hard = early.find((s) => s.item.work.id === 'hard-thing')!
  assert.equal(hard.status, 'later')
  assert.match(hard.why, /premature while validating/)

  const ready = readingPath(loaded, 'lean-startup', brief({
    founderContext: { stage: 'OPERATE_LEAD', currentDecision: '', actionHoursPerWeek: 2, activeApplyBooks: 0 },
  }))
  assert.equal(ready.find((s) => s.item.work.id === 'hard-thing')!.status, 'next')
})

test('a book with no chain is one step, not an invented curriculum', () => {
  const steps = readingPath(loaded, 'psychology-of-money', brief())
  assert.equal(steps.length, 1)
  assert.equal(steps[0].status, 'now')
})

/**
 * Every note a route can carry. A keyword blocklist cannot do this job: the
 * first version of this test flagged Nidus's own disclaimer, because "does not
 * know whether it is in stock" and "in stock tomorrow" share every word that
 * matters. A reviewed whitelist can — adding a note means editing this list,
 * which is the review.
 */
const ALLOWED_NOTES = new Set([
  'Out of copyright. The translation you pick changes the reading, so choose deliberately.',
  'A search, not a listing. Nidus does not know the price or whether it is in stock.',
  'Nidus cannot see any shop\u2019s shelves. Ringing one is still the fastest way to know.',
  'Often the cheapest route, and the one people forget.',
])

test('every route is a search, with a reviewed note and no affiliate tag', () => {
  for (const it of loaded.items) {
    const routes = findRoutes(it, PUBLIC_DOMAIN_WORKS.includes(it.work.id))
    assert.ok(routes.length >= 3, it.work.id)
    for (const r of routes) {
      assert.match(r.url, /^https:\/\//)
      // A search endpoint carries the query. A product listing would not, and
      // would go wrong the first time a price or an edition changed.
      assert.match(r.url, /[?&](q|k|query)=/, `${r.label} is not a search URL`)
      assert.ok(ALLOWED_NOTES.has(r.note), `unreviewed route note: ${r.note}`)
      // No affiliate tags, no commission, ever.
      assert.doesNotMatch(r.url, /[?&](tag|ref|aff|utm_)/)
      // The label is generated next to the link and must not promise anything.
      assert.doesNotMatch(r.label, /\b(₹|\$|cheap|fast|best|deal|offer|delivery)\b/i)
    }
  }
})

test('a public-domain work offers the free route first', () => {
  const routes = findRoutes(item('meditations'), true)
  assert.match(routes[0].label, /free/i)
  assert.match(routes[0].url, /gutenberg\.org/)
})
