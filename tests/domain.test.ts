import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ReadingBrief, CATALOGUE_VERSION } from '../src/domain/contracts.ts'
import type { ReadingBrief as Brief } from '../src/domain/contracts.ts'
import { loadCatalogue } from '../src/domain/catalogue.ts'
import type { CatalogueItem, LoadedCatalogue } from '../src/domain/catalogue.ts'
import { seedWorks, seedEditions, seedProfiles } from '../src/data/catalogue.seed.ts'
import { rank, isEligible, accessRoute, RANKER_VERSION } from '../src/domain/ranker.ts'

const loaded = loadCatalogue(seedWorks, seedEditions, seedProfiles)

function brief(over: Partial<Brief> = {}): Brief {
  return ReadingBrief.parse({
    purpose: 'company-building', mode: 'apply', language: 'en', sessionMinutes: 20, ...over,
  })
}

const founderBrief = (over: Record<string, unknown> = {}) =>
  brief({ founderContext: { stage: 'VALIDATE', currentDecision: '', actionHoursPerWeek: 2, activeApplyBooks: 0, ...over } } as Partial<Brief>)

const DRAFT = { source: 't', confirmedAt: null }

function tinyCatalogue(
  work: Record<string, unknown> = {},
  edition: Record<string, unknown> = {},
  profile: Record<string, unknown> = {},
): LoadedCatalogue {
  return loadCatalogue(
    [{ id: 'w', title: 'W', author: 'A', firstPublished: null, fiction: false, provenance: DRAFT, ...work }],
    [{ id: 'e', workId: 'w', language: 'en', isbn13: null, format: 'print', pages: null, provenance: DRAFT, ...edition }],
    [{
      workId: 'w', inOneLine: 'A test book about one small thing.', modes: ['apply'],
      topics: ['validation'], conceptualDifficulty: 2,
      typicalSessionMinutes: 10, actionability: 4, emotionalIntensity: 1, targetStages: ['VALIDATE'],
      competencyTags: ['customer-learning'], prerequisites: [], tooEarlyStages: [],
      suggestedArtifact: 'do the thing', provenance: DRAFT, ...profile,
    }],
  )
}

const only = (c: LoadedCatalogue): CatalogueItem => c.items[0]

/* ================= P01: catalogue and contracts ================= */

test('seed loads works with their editions and editorial profile assembled', () => {
  assert.ok(loaded.items.length >= 12, 'expected the real seed works to load')
  for (const item of loaded.items) {
    assert.ok(item.editions.length > 0)
    assert.equal(item.profile.workId, item.work.id)
  }
})

test('every broken seed fixture is rejected with a reason, and nothing throws', () => {
  const ids = loaded.rejected.map((r) => String(r.id)).sort()
  assert.ok(ids.includes('broken-work'), 'work with an empty title')
  assert.ok(ids.includes('broken-edition'), 'edition with no language')
  assert.ok(ids.includes('orphan-edition'), 'edition pointing at no work')
  assert.ok(ids.includes('siddhartha'), 'duplicate profile')
  for (const r of loaded.rejected) assert.ok(r.problems.length > 0, `${r.id} must say why`)
})

test('facts and editorial inference carry separate provenance', () => {
  for (const item of loaded.items) {
    assert.ok(item.work.provenance.source.length > 0)
    assert.ok(item.profile.provenance.source.length > 0)
    assert.notEqual(item.work.provenance.source, item.profile.provenance.source)
  }
})

test('no seeded row claims verification it does not have', () => {
  for (const item of loaded.items) {
    assert.equal(item.work.provenance.confirmedAt, null, item.work.id)
    assert.equal(item.profile.provenance.confirmedAt, null, item.work.id)
    for (const e of item.editions) assert.equal(e.provenance.confirmedAt, null, e.id)
  }
})

test('a work with no valid edition is rejected, not shown without one', () => {
  const c = loadCatalogue(
    [{ id: 'w', title: 'W', author: 'A', firstPublished: null, fiction: false, provenance: DRAFT }],
    [], [],
  )
  assert.equal(c.items.length, 0)
  assert.deepEqual(c.rejected.at(-1)?.problems, ['no valid edition'])
})

test('a work with no editorial profile is rejected rather than scored on defaults', () => {
  const c = loadCatalogue(
    [{ id: 'w', title: 'W', author: 'A', firstPublished: null, fiction: false, provenance: DRAFT }],
    [{ id: 'e', workId: 'w', language: 'en', isbn13: null, format: 'print', pages: null, provenance: DRAFT }],
    [],
  )
  assert.equal(c.items.length, 0)
  assert.deepEqual(c.rejected.at(-1)?.problems, ['no editorial profile'])
})

test('duplicate work ids and non-array input survive', () => {
  const w = { id: 'w', title: 'W', author: 'A', firstPublished: null, fiction: false, provenance: DRAFT }
  const dup = loadCatalogue([w, w], [], [])
  assert.ok(dup.rejected.some((r) => r.problems.includes('duplicate work id')))
  const broken = loadCatalogue('nope', 'nope', 'nope')
  assert.equal(broken.items.length, 0)
  assert.equal(broken.rejected.length, 3)
})

test('the catalogue reports its version, and decisions carry it', () => {
  assert.equal(loaded.version, CATALOGUE_VERSION)
  const d = rank(loaded, founderBrief()).decisions[0]
  assert.equal(d.catalogueVersion, CATALOGUE_VERSION)
  assert.equal(d.rankerVersion, RANKER_VERSION)
})

/* ================= P02: the eligibility gate ================= */

test('language is a hard gate, never a penalty', () => {
  const v = isEligible(only(tinyCatalogue()), brief({ language: 'te' }))
  assert.equal(v.ok, false)
  assert.equal((v as { kind: string }).kind, 'language')
})

test('the adult gate is explicit', () => {
  const v = isEligible(only(tinyCatalogue()), brief({ adultConfirmed: false }))
  assert.equal(v.ok, false)
  assert.equal((v as { kind: string }).kind, 'audience')
})

test('a finished book is excluded unless the reader asks to revisit it', () => {
  const item = only(tinyCatalogue())
  const done = { intents: [{ workId: 'w', status: 'COMPLETED' }] } as unknown as Partial<Brief>
  assert.equal(isEligible(item, brief(done)).ok, false)
  assert.equal(isEligible(item, brief({ ...done, revisitCompleted: true })).ok, true)
})

test('a deferred book stays out, and a rejected one stays out for the session', () => {
  const item = only(tinyCatalogue())
  assert.equal(isEligible(item, brief({ intents: [{ workId: 'w', status: 'DEFERRED' }] } as unknown as Partial<Brief>)).ok, false)
  assert.equal(isEligible(item, brief({ rejections: [{ workId: 'w', reason: 'too-difficult' }] } as unknown as Partial<Brief>)).ok, false)
})

test('mode is a gate: an enjoy-only book never appears in apply mode', () => {
  assert.equal(isEligible(only(tinyCatalogue({}, {}, { modes: ['enjoy'] })), brief({ mode: 'apply' })).ok, false)
})

test('the exploration result still has to pass the language gate', () => {
  const r = rank(loaded, brief({ mode: 'explore', purpose: 'curiosity', language: 'hi' }))
  for (const d of r.decisions) {
    const item = loaded.items.find((i) => i.work.id === d.workId)!
    assert.ok(item.editions.some((e) => e.language === 'hi'), `${d.workId} has no hi edition`)
  }
})

/* ================= P02: generic branch weights ================= */

test('the generic ranker uses the documented 30/20/15/15/10/10 weights', () => {
  const d = rank(loaded, brief({ purpose: 'curiosity', mode: 'explore' })).decisions[0]
  assert.equal(d.branch, 'generic')
  const max = Object.fromEntries(d.components.map((c) => [c.signal, c.maxPoints]))
  assert.deepEqual(max, {
    purpose: 30, mode: 20, context: 15, timeDifficulty: 15, access: 10, history: 10,
  })
  assert.equal(d.components.reduce((s, c) => s + c.maxPoints, 0), 100)
})

test('a score is always the sum of its own components', () => {
  for (const d of rank(loaded, brief({ purpose: 'unwind', mode: 'enjoy' })).decisions) {
    const sum = Math.round(d.components.reduce((s, c) => s + c.points, 0) * 10) / 10
    assert.equal(d.score, sum, d.workId)
  }
})

test('enjoy mode ranks a heavy book below a restful one', () => {
  const r = rank(loaded, brief({ purpose: 'unwind', mode: 'enjoy', sessionMinutes: 10 }))
  const chosen = r.decisions.map((d) => d.workId)
  assert.ok(!chosen.includes('man-search-meaning'), 'an emotionally heavy book is not restful reading')
})

test('a book already on your shelf scores higher on access than one you must buy', () => {
  const c = tinyCatalogue()
  const owned = rank(c, brief({ intents: [{ workId: 'w', status: 'OWNED' }] } as unknown as Partial<Brief>))
  const not = rank(c, brief())
  const pick = (r: typeof owned) => r.decisions[0].components.find((x) => x.signal === 'access')!.points
  assert.ok(pick(owned) > pick(not))
  assert.equal(owned.decisions[0].accessRoute, 'on-your-shelf')
  assert.equal(not.decisions[0].accessRoute, 'to-obtain')
})

test('a public-domain work is reachable without claiming a shop has it', () => {
  assert.equal(accessRoute(loaded.items.find((i) => i.work.id === 'five-rings')!, brief()), 'public-domain')
})

/* ================= P02: founder branch ================= */

test('the founder branch is entered only for apply plus entrepreneurship plus context', () => {
  assert.equal(rank(loaded, founderBrief()).branch, 'founder')
  assert.equal(rank(loaded, brief()).branch, 'generic', 'no confirmed context means no founder branch')
  assert.equal(rank(loaded, brief({ mode: 'explore' })).branch, 'generic')
})

test('the founder ranker uses the blueprint weights and does not reuse generic terms', () => {
  const d = rank(loaded, founderBrief()).decisions[0]
  const max = Object.fromEntries(d.components.filter((c) => c.points >= 0).map((c) => [c.signal, c.maxPoints]))
  assert.deepEqual(max, {
    purpose: 25, stage: 20, 'competency-gap': 15, 'decision-urgency': 15,
    'prerequisite-readiness': 10, actionability: 5, access: 5, 'cognitive-variety': 5,
  })
  const signals = d.components.map((c) => c.signal)
  assert.equal(signals.includes('context'), false, 'generic context term must not be counted again')
  assert.equal(signals.includes('timeDifficulty'), false, 'generic time term must not be counted again')
})

test('a book premature for the stage is penalised and deferred, not just downranked', () => {
  const r = rank(loaded, founderBrief({ stage: 'VALIDATE' }))
  const hard = rank(loaded, founderBrief({ stage: 'VALIDATE' })).decisions.find((d) => d.workId === 'hard-thing')
  // It should not lead; if it appears at all it must be marked.
  assert.notEqual(r.decisions[0].workId, 'hard-thing')
  if (hard) {
    assert.equal(hard.recommendedUsage, 'DEFER')
    assert.ok(hard.deferReason)
    assert.ok(hard.components.some((c) => c.signal === 'too-early' && c.points === -25))
  }
})

test('a missing prerequisite is named, penalised and turns a full read into chapters', () => {
  const c = tinyCatalogue({}, {}, { prerequisites: ['lean-startup'] })
  const d = rank(c, founderBrief()).decisions[0]
  assert.deepEqual(d.missingPrerequisites, ['lean-startup'])
  assert.equal(d.recommendedUsage, 'SELECTED_CHAPTERS')
  assert.ok(d.components.some((x) => x.signal === 'redundancy-or-gap' && x.points === -15))
})

test('a completed prerequisite clears the penalty', () => {
  const c = tinyCatalogue({}, {}, { prerequisites: ['lean-startup'] })
  const withIt = founderBrief()
  withIt.intents = [{ workId: 'lean-startup', status: 'COMPLETED' }]
  const d = rank(c, withIt).decisions[0]
  assert.deepEqual(d.missingPrerequisites, [])
  assert.equal(d.recommendedUsage, 'FULL_READ')
})

test('the cognitive-load cap defers a second apply book instead of stacking them', () => {
  const d = rank(tinyCatalogue(), founderBrief({ activeApplyBooks: 1 })).decisions[0]
  assert.ok(d.components.some((c) => c.signal === 'active-workload' && c.points === -10))
  assert.equal(d.recommendedUsage, 'DEFER')
})

test('founder scores stay inside 0 to 100 after penalties', () => {
  for (const d of rank(loaded, founderBrief({ stage: 'EXPLORE', activeApplyBooks: 1 })).decisions) {
    assert.ok(d.score >= 0 && d.score <= 100, `${d.workId} scored ${d.score}`)
  }
})

/* ================= P02: selection and explanation ================= */

test('results are strongest fit, adjacent fit and one exploration', () => {
  const r = rank(loaded, brief({ purpose: 'curiosity', mode: 'explore' }))
  assert.ok(r.decisions.length <= 3)
  assert.deepEqual([...new Set(r.decisions.map((d) => d.role))], r.decisions.map((d) => d.role))
  assert.equal(r.decisions[0].role, 'strongest-fit')
})

test('three results are never forced when only one book is eligible', () => {
  assert.equal(rank(tinyCatalogue(), brief()).decisions.length, 1)
})

test('every decision separates the reading step from the real-world action', () => {
  const applyD = rank(loaded, founderBrief()).decisions[0]
  assert.ok(applyD.firstStep.length > 0)
  assert.ok(applyD.realWorldAction, 'apply mode must name a non-reading action when the book has one')
  assert.notEqual(applyD.firstStep, applyD.realWorldAction)

  const enjoyD = rank(loaded, brief({ purpose: 'unwind', mode: 'enjoy' })).decisions[0]
  assert.equal(enjoyD.realWorldAction, null, 'enjoy mode never demands an artifact')
})

test('every decision explains why this book, why now and why this mode, and what it cannot do', () => {
  for (const d of rank(loaded, brief({ purpose: 'curiosity', mode: 'explore' })).decisions) {
    assert.ok(d.whyThisBook.length > 0)
    assert.ok(d.whyNow.length > 0)
    assert.ok(d.whyThisMode.length > 0)
    assert.ok(d.cannotDo.length > 0, 'the limits list is never empty')
    assert.ok(d.cannotDo.some((l) => /not been confirmed/.test(l)), 'unverified rows must say so')
    assert.ok(d.cannotDo.some((l) => /in stock near you/.test(l)), 'never imply local availability')
  }
})

test('apply mode states that reading cannot replace the work itself', () => {
  const d = rank(loaded, founderBrief()).decisions[0]
  assert.ok(d.cannotDo.some((l) => /cannot replace customer contact/.test(l)))
})

test('an empty result caused by language coverage is reported as a language gap', () => {
  const r = rank(loaded, brief({ language: 'ta' }))
  assert.equal(r.decisions.length, 0)
  assert.equal(r.gap, 'language')
})

test('an empty result caused by taste is not blamed on language', () => {
  const r = rank(tinyCatalogue({}, {}, { modes: ['enjoy'] }), brief({ mode: 'apply' }))
  assert.equal(r.decisions.length, 0)
  assert.equal(r.gap, null)
})

test('asking for an audiobook is refused, not answered with a print edition', () => {
  // Every seed edition is print. The honest answer is an empty result naming
  // the format, NOT the same book with the format quietly ignored.
  const r = rank(loaded, brief({ formatPreference: 'audio' }))
  assert.equal(r.decisions.length, 0)
  assert.equal(r.gap, 'format')
})

test('a format gap is reported as format, not as a missing language', () => {
  const r = rank(loaded, brief({ language: 'en', formatPreference: 'ebook' }))
  assert.equal(r.gap, 'format')
})

test('free-only excludes every book the reader would have to buy', () => {
  const r = rank(loaded, brief({ purpose: 'curiosity', mode: 'explore', budget: 'free-only' }))
  for (const d of r.decisions) {
    assert.notEqual(d.accessRoute, 'to-obtain')
  }
})

test('an author filter answers only from that author', () => {
  const r = rank(loaded, brief({
    purpose: 'curiosity', mode: 'explore', author: 'Daniel Kahneman',
  }))
  assert.ok(r.decisions.length > 0)
  for (const d of r.decisions) {
    assert.equal(loaded.items.find((i) => i.work.id === d.workId)?.work.author, 'Daniel Kahneman')
  }
})

test('an author nobody in the catalogue matches is reported as an author gap', () => {
  const r = rank(loaded, brief({ author: 'Nobody At All' }))
  assert.equal(r.decisions.length, 0)
  assert.equal(r.gap, 'author')
})

test('every catalogue book has a plain-English one-liner that is not the title', () => {
  for (const item of loaded.items) {
    assert.ok(item.profile.inOneLine.length > 20, item.work.id)
    assert.notEqual(item.profile.inOneLine, item.work.title)
  }
})

test('no seed book carries an unsourced popularity claim', () => {
  // A sales figure with no source and no date is marketing, not a fact. The
  // schema cannot be satisfied by accident, so this asserts the seed is clean.
  for (const item of loaded.items) {
    assert.equal(item.work.popularity, null, item.work.id)
  }
})

test('popularity never appears in a score breakdown', () => {
  const d = rank(loaded, founderBrief()).decisions[0]
  assert.equal(d.components.some((c) => /popular|sales/i.test(c.signal)), false)
})

test('ranking is stable for the same brief', () => {
  const a = rank(loaded, founderBrief()).decisions.map((d) => d.workId)
  const b = rank(loaded, founderBrief()).decisions.map((d) => d.workId)
  assert.deepEqual(a, b)
})
