import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ReadingBrief } from '../src/domain/contracts.ts'
import { loadCatalogue } from '../src/domain/catalogue.ts'
import { seedWorks, seedEditions, seedProfiles } from '../src/data/catalogue.seed.ts'
import { rank, rejectionSignals } from '../src/domain/ranker.ts'

/**
 * A rejection has to mean what the reader said it meant.
 *
 * `REJECTION_REASONS` carried the comment "the same click means different
 * things" from the day it was written, while the ranker read only `workId`.
 * Seven buttons, one behaviour. These tests exist so that cannot silently
 * become true again — each one fails if a reason stops generalising.
 */

const c = loadCatalogue(seedWorks, seedEditions, seedProfiles)

const base = {
  purpose: 'company-building' as const, mode: 'explore' as const,
  language: 'en' as const, sessionMinutes: 25, intents: [],
}

/** Rank with an author filter so one named book is forced into the result. */
function forcedScore(workId: string, extra: object = {}) {
  const item = c.items.find((i) => i.work.id === workId)!
  const r = rank(c, ReadingBrief.parse({ ...base, ...extra, author: item.work.author }))
  const d = r.decisions.find((x) => x.workId === workId)
  assert.ok(d, `${workId} was not scored — check the author filter`)
  return d
}

test('a difficult book rejected makes OTHER difficult books score lower', () => {
  // Thinking, Fast and Slow is difficulty 4. Reject it as too difficult and a
  // different demanding book must feel the consequence.
  const hard = c.items.find((i) => i.profile.conceptualDifficulty >= 4
    && i.work.id !== 'thinking-fast-slow')!

  const before = forcedScore(hard.work.id)
  const after = forcedScore(hard.work.id, {
    rejections: [{ workId: 'thinking-fast-slow', reason: 'too-difficult' }],
  })
  assert.ok(after.score < before.score,
    `"too difficult" did not reach ${hard.work.title}: ${before.score} -> ${after.score}`)
  assert.ok(after.components.some((x) => x.signal === 'you-said-no'),
    'the reader cannot see why the score dropped')
})

test('"I cannot get it" stops other to-obtain books ranking as if nothing happened', () => {
  const toObtain = c.items.find((i) => {
    const d = rank(c, ReadingBrief.parse({ ...base, author: i.work.author }))
      .decisions.find((x) => x.workId === i.work.id)
    return d?.accessRoute === 'to-obtain'
  })!
  const before = forcedScore(toObtain.work.id)
  const after = forcedScore(toObtain.work.id, {
    rejections: [{ workId: 'mom-test', reason: 'unavailable' }],
  })
  assert.ok(after.score < before.score, 'another book to buy scored the same as before')
})

test('"repetitive" is about the topics, not the title', () => {
  const rejected = c.items.find((i) => i.work.id === 'zero-to-one')!
  // Something else sharing a topic with it.
  const sibling = c.items.find((i) =>
    i.work.id !== 'zero-to-one' && i.profile.topics.some((t) => rejected.profile.topics.includes(t)))!

  const before = forcedScore(sibling.work.id)
  const after = forcedScore(sibling.work.id, {
    rejections: [{ workId: 'zero-to-one', reason: 'repetitive' }],
  })
  assert.ok(after.score < before.score,
    `"repetitive" did not reach ${sibling.work.title}, which shares its topics`)
  const said = after.components.find((x) => x.signal === 'you-said-no')!
  assert.match(said.text, /set aside/)
})

test('"just does not appeal" is about that book only, and says nothing about others', () => {
  // The deliberate non-generalisation. Taste is not a topic, and guessing that
  // it is would be the product inventing a preference the reader never stated.
  const other = c.items.find((i) => i.work.id !== 'zero-to-one'
    && i.profile.topics.some((t) => ['strategy', 'company-building'].includes(t)))!
  const before = forcedScore(other.work.id)
  const after = forcedScore(other.work.id, {
    rejections: [{ workId: 'zero-to-one', reason: 'unappealing' }],
  })
  assert.equal(after.score, before.score,
    'disliking one book quietly marked down a book the reader said nothing about')
})

test('one rejection is charged once, however many ways it applies', () => {
  // A book that is difficult AND shares topics AND must be bought should take
  // a single penalty, not three. Otherwise two rejections could bury a book
  // the reader has never seen.
  const sigs = rejectionSignals(c, ReadingBrief.parse({
    ...base,
    rejections: [
      { workId: 'thinking-fast-slow', reason: 'too-difficult' },
      { workId: 'zero-to-one', reason: 'repetitive' },
      { workId: 'mom-test', reason: 'unavailable' },
    ],
  }))
  assert.ok(sigs.tooHardAt !== null && sigs.tiredTopics.length > 0 && sigs.cannotObtain)

  const r = rank(c, ReadingBrief.parse({
    ...base,
    rejections: [
      { workId: 'thinking-fast-slow', reason: 'too-difficult' },
      { workId: 'zero-to-one', reason: 'repetitive' },
      { workId: 'mom-test', reason: 'unavailable' },
    ],
  }))
  for (const d of r.decisions) {
    const hits = d.components.filter((x) => x.signal === 'you-said-no')
    assert.ok(hits.length <= 1, `${d.workId} was penalised ${hits.length} times for rejections`)
  }
})

test('rejections never push a score below zero', () => {
  const r = rank(c, ReadingBrief.parse({
    ...base, sessionMinutes: 5,
    rejections: c.items.slice(0, 12).map((i) => ({ workId: i.work.id, reason: 'repetitive' as const })),
  }))
  for (const d of r.decisions) {
    assert.ok(d.score >= 0, `${d.workId} scored ${d.score}`)
    const sum = d.components.reduce((s, x) => s + x.points, 0)
    assert.ok(d.score >= Math.min(...[sum, 0]) || d.score >= 0)
  }
})

test('a rejection of a book not in the catalogue is ignored rather than throwing', () => {
  const sigs = rejectionSignals(c, ReadingBrief.parse({
    ...base, rejections: [{ workId: 'a-book-we-do-not-have', reason: 'too-difficult' }],
  }))
  assert.deepEqual(sigs, { tooHardAt: null, tiredTopics: [], cannotObtain: false })
})

/* ================= the topic overlap term ================= */

test('covering everything the reader named beats covering some of it', () => {
  // The cap this replaces gave full marks at two hits however many were named,
  // so eleven books matching two scored exactly as well as the three matching
  // all three — and terms the reader never mentioned then broke the tie.
  // Measured 3 Nov: no book carries more than five topics, so the farming the
  // cap defended against is not a shape this catalogue has ever held.
  const named = ['judgement', 'strategy', 'company-building']
  const brief = {
    purpose: 'company-building' as const, mode: 'explore' as const,
    language: 'en' as const, sessionMinutes: 20, intents: [], confirmedTopics: named,
  }
  const r = rank(c, ReadingBrief.parse(brief))

  const covers = (id: string) =>
    c.items.find((i) => i.work.id === id)!.profile.topics.filter((t) => named.includes(t)).length

  // The strongest-fit result must cover everything asked for, when books that
  // do exist in the catalogue.
  const best = r.decisions.find((d) => d.role === 'strongest-fit')!
  assert.equal(covers(best.workId), named.length,
    `strongest fit covers only ${covers(best.workId)} of ${named.length} named topics`)

  // And the purpose term must actually differ between a 3/3 and a 2/3 book,
  // which is the thing the cap flattened.
  const three = c.items.find((i) => covers(i.work.id) === 3)!
  const two = c.items.find((i) => covers(i.work.id) === 2)!
  const scoreFor = (id: string) => {
    const item = c.items.find((i) => i.work.id === id)!
    const one = rank(c, ReadingBrief.parse({ ...brief, author: item.work.author }))
    return one.decisions.find((d) => d.workId === id)!.components
      .find((x) => x.signal === 'purpose')!.points
  }
  assert.ok(scoreFor(three.work.id) > scoreFor(two.work.id),
    `"${three.work.title}" (3/3) did not score above "${two.work.title}" (2/3) on purpose`)
})

test('naming one topic can still reach full marks on one hit', () => {
  // Proportional, not harder. A reader who asked for one thing and got a book
  // about that thing has been served exactly as well as one who named four and
  // got all four.
  const r = rank(c, ReadingBrief.parse({
    purpose: 'curiosity' as const, mode: 'enjoy' as const, language: 'en' as const,
    sessionMinutes: 20, intents: [], confirmedTopics: ['solitude'],
  }))
  const best = r.decisions.find((d) => d.role === 'strongest-fit')!
  const purpose = best.components.find((x) => x.signal === 'purpose')!
  assert.equal(purpose.points, purpose.maxPoints,
    'a single named topic, fully covered, did not earn the whole purpose term')
})
