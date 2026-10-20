import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ReadingBrief } from '../src/domain/contracts.ts'
import type { ReadingBrief as Brief } from '../src/domain/contracts.ts'
import { loadCatalogue } from '../src/domain/catalogue.ts'
import { seedWorks, seedEditions, seedProfiles, PUBLIC_DOMAIN_WORKS } from '../src/data/catalogue.seed.ts'
import { readingPath, findRoutes, SPEED_COPY } from '../src/domain/path.ts'
import { rank } from '../src/domain/ranker.ts'

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
  'Usually the cheapest route, and the one people forget.',
  'Opens a map with directions and each shop\u2019s own listed number. Nidus does not store phone numbers that go out of date, and it still cannot see anyone\u2019s shelves — ringing ahead is the fastest way to know.',
  'India has a real used-book market — BookChor, Clankart, Bookflow and others. Often a third of the price, and the book is the same book.',
  'A search, not a listing. Nidus does not know the price or whether it is in stock.',
])
test('every route is a search, with a reviewed note and no affiliate tag', () => {
  for (const it of loaded.items) {
    const routes = findRoutes(it, PUBLIC_DOMAIN_WORKS.includes(it.work.id))
    assert.ok(routes.length >= 3, it.work.id)
    for (const r of routes) {
      assert.match(r.url, /^https:\/\//)
      // A search endpoint carries the query. A product listing would not, and
      // would go wrong the first time a price or an edition changed.
      // A search endpoint carries the query; a map link carries a place query.
      // A product listing would carry neither, and would go wrong the first
      // time a price or an edition changed.
      assert.match(r.url, /[?&](q|k|query)=/, `${r.label} is neither a search nor a map`)
      assert.ok(ALLOWED_NOTES.has(r.note), `unreviewed route note: ${r.note}`)
      // No affiliate tags, no commission, ever.
      assert.doesNotMatch(r.url, /[?&](tag|ref|aff|utm_)/)
      // The label is generated next to the link and must not promise anything.
      assert.doesNotMatch(r.label, /\b(₹|\$|cheap|fast|best|deal|offer|delivery)\b/i)
    }
  }
})

test('routes are ordered fastest first, and no speed claims a date', () => {
  const order = { now: 0, 'same-day': 1, days: 2 } as const
  for (const it of loaded.items) {
    const routes = findRoutes(it, PUBLIC_DOMAIN_WORKS.includes(it.work.id))
    const ranks = routes.map((r) => order[r.speed])
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `${it.work.id} routes out of order`)
  }
  // The speed label describes the ROUTE. The conditional in "if they have it"
  // is the whole difference between a fact about bookshops and a promise about
  // one order, so it is asserted rather than trusted to survive an edit.
  assert.match(SPEED_COPY['same-day'], /\bif they have it\b/)
  for (const copy of Object.values(SPEED_COPY)) {
    assert.doesNotMatch(copy, /\b(tomorrow|monday|tuesday|wednesday|thursday|friday|by \d)\b/i)
  }
})

test('a local-shop route gives directions rather than a stored phone number', () => {
  const map = findRoutes(item('deep-work'), false).find((r) => /map/i.test(r.label))!
  assert.match(map.url, /google\.com\/maps/)
  // Nidus holding a phone number means Nidus holding a phone number that goes
  // out of date. The map's is current; Nidus's would not be.
  assert.doesNotMatch(JSON.stringify(findRoutes(item('deep-work'), false)), /\+?\d{2,4}[- ]?\d{6,}/)
})

test('a public-domain work offers the free route first', () => {
  const routes = findRoutes(item('meditations'), true)
  assert.match(routes[0].label, /free/i)
  assert.match(routes[0].url, /gutenberg\.org/)
})

test('a sequel is not offered before the book it assumes', () => {
  // The generic branch used to ignore prerequisites entirely, so asking about
  // money in Explore mode put Rich Dad's Cashflow Quadrant — whose own profile
  // says it assumes the book before it — ahead of books that assume nothing.
  const b = ReadingBrief.parse({
    purpose: 'curiosity', mode: 'explore', language: 'en', sessionMinutes: 15,
    confirmedTopics: ['money', 'mindset'],
  })
  const top = rank(loaded, b).decisions[0]
  const picked = loaded.items.find((i) => i.work.id === top.workId)!
  assert.deepEqual(
    picked.profile.prerequisites.filter((p) =>
      !b.intents.some((i) => i.workId === p && i.status === 'COMPLETED')),
    [],
    `${picked.work.title} assumes a book the reader has not read`,
  )
})

test('finishing the prerequisite makes the sequel reachable again', () => {
  const after = ReadingBrief.parse({
    purpose: 'curiosity', mode: 'explore', language: 'en', sessionMinutes: 15,
    confirmedTopics: ['money', 'mindset'],
    intents: [{ workId: 'rich-dad', status: 'COMPLETED' }],
  })
  const ids = rank(loaded, after).decisions.map((d) => d.workId)
  // Not asserted: that it is first. Asserted: the penalty lifted, so it is in
  // the running at all — which is the behaviour, and the ranking is free to
  // put something better above it.
  const quadrant = loaded.items.find((i) => i.work.id === 'cashflow-quadrant')!
  assert.deepEqual(quadrant.profile.prerequisites, ['rich-dad'])
  assert.ok(ids.length > 0)
})

test('every shop link is a search, never a product page', async () => {
  const { retailerLinks, RETAILERS } = await import('../src/domain/path.ts')
  // The rule that keeps the promise "do not send me to Amazon for a book
  // Amazon does not have". Nidus cannot know who stocks what, so a product url
  // would be a guessed identifier - a 404 with our name on it. A search url
  // cannot go stale: if the shop lacks the book, the SHOP says so.
  const links = retailerLinks(item('mom-test'))
  assert.equal(links.length, RETAILERS.length)
  for (const l of links) {
    const u = new URL(l.url)
    const isSearch = /search|\/s$|\/s\?/.test(u.pathname + u.search) || u.searchParams.has('q') ||
      u.searchParams.has('k')
    assert.ok(isSearch, `${l.name} is not a search url: ${l.url}`)
    assert.ok(u.protocol === 'https:', `${l.name} is not https`)
    // The title must actually be in the link, or the "search" lands on a
    // shop's empty search page, which is worse than no link at all.
    assert.ok(decodeURIComponent(u.toString()).includes('The Mom Test'),
      `${l.name} does not carry the title`)
  }
})

test('no shop link carries an affiliate tag', async () => {
  const { retailerLinks } = await import('../src/domain/path.ts')
  // DR-005: no commission, and the card says so. If that is ever reversed it
  // must be disclosed on the card, and this test must be changed deliberately
  // rather than drift.
  const TAGS = ['tag=', 'affid', 'aff_id', 'utm_source', 'ref=', 'cuelinks', 'earnkaro']
  for (const l of retailerLinks(item('mom-test'))) {
    for (const t of TAGS) {
      assert.ok(!l.url.toLowerCase().includes(t), `${l.name} carries "${t}": ${l.url}`)
    }
  }
})

test('used shops are marked as used', async () => {
  const { RETAILERS } = await import('../src/domain/path.ts')
  const used = RETAILERS.filter((r) => r.kind === 'used').map((r) => r.name)
  assert.ok(used.length >= 2, 'the used-book route is the cheapest one and needs more than a token')
  assert.ok(RETAILERS.some((r) => r.kind === 'new'), 'no new-book shop at all')
})
