import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ReadingBrief } from '../src/domain/contracts.ts'
import type { CatalogueEdition, ReadingBrief as Brief } from '../src/domain/contracts.ts'
import { loadCatalogue } from '../src/domain/catalogue.ts'
import { seedRows } from '../src/data/catalogue.seed.ts'
import { rank, scoreEdition, selectDiverse, isEligible, RANKER_VERSION } from '../src/domain/ranker.ts'

const loaded = loadCatalogue(seedRows)

function brief(over: Partial<Brief> = {}): Brief {
  return ReadingBrief.parse({
    purpose: 'company-building',
    mode: 'apply',
    language: 'en',
    sessionMinutes: 20,
    founderStage: 'idea',
    ...over,
  })
}

function edition(over: Partial<CatalogueEdition> = {}): CatalogueEdition {
  return {
    id: 'x',
    title: 'X',
    author: 'A',
    languages: ['en'],
    isbn13: null,
    firstPublished: null,
    pages: null,
    fiction: false,
    modes: ['apply'],
    difficulty: 2,
    minSessionMinutes: 10,
    topics: ['validation'],
    founderStages: ['idea'],
    provenance: { source: 'test', confirmedAt: null },
    ...over,
  }
}

/* ---------- P01: catalogue and contracts ---------- */

test('loader keeps valid rows and rejects invalid ones without throwing', () => {
  assert.ok(loaded.editions.length >= 10, 'expected the real seed titles to load')
  assert.equal(loaded.rejected.length, 2, 'expected exactly the two broken fixtures to be rejected')
  const ids = loaded.rejected.map((r) => r.id).sort()
  assert.deepEqual(ids, ['broken-bad-difficulty', 'broken-missing-language'])
  for (const r of loaded.rejected) assert.ok(r.problems.length > 0, 'a rejection must say why')
})

test('loader rejects a duplicate id rather than silently keeping the last one', () => {
  const dup = loadCatalogue([edition(), edition()])
  assert.equal(dup.editions.length, 1)
  assert.deepEqual(dup.rejected[0].problems, ['duplicate id'])
})

test('loader survives a catalogue that is not an array', () => {
  const broken = loadCatalogue('nope')
  assert.equal(broken.editions.length, 0)
  assert.equal(broken.rejected.length, 1)
})

test('no seeded edition claims to be confirmed against a source', () => {
  for (const e of loaded.editions) {
    assert.equal(e.provenance.confirmedAt, null, `${e.id} must not claim verification it does not have`)
  }
})

/* ---------- P02: eligibility gates ---------- */

test('a language with no edition is a hard gate, not a penalty', () => {
  const verdict = isEligible(edition({ languages: ['en'] }), brief({ language: 'te' }))
  assert.equal(verdict.ok, false)
  assert.match((verdict as { reason: string }).reason, /no confirmed te edition/)
})

test('a finished book is excluded unless the reader asks to revisit it', () => {
  const e = edition()
  assert.equal(isEligible(e, brief({ completedIds: ['x'] })).ok, false)
  assert.equal(isEligible(e, brief({ completedIds: ['x'], revisitCompleted: true })).ok, true)
})

test('a rejected book stays out for the rest of the session', () => {
  assert.equal(isEligible(edition(), brief({ rejectedIds: ['x'] })).ok, false)
})

test('mode is a gate: an enjoy-only book never appears in apply mode', () => {
  assert.equal(isEligible(edition({ modes: ['enjoy'] }), brief({ mode: 'apply' })).ok, false)
})

test('an exploration result still has to pass the language gate', () => {
  const result = rank(loaded.editions, brief({ mode: 'explore', purpose: 'curiosity', language: 'te' }))
  for (const d of result.decisions) {
    const e = loaded.editions.find((x) => x.id === d.editionId)!
    assert.ok(e.languages.includes('te'))
  }
})

/* ---------- P02: scoring ---------- */

test('founder-stage mismatch subtracts in apply mode', () => {
  const b = brief({ founderStage: 'idea' })
  const fit = scoreEdition(edition({ founderStages: ['idea'] }), b)
  const miss = scoreEdition(edition({ founderStages: ['scaling'] }), b)
  assert.ok(fit.score > miss.score)
  assert.ok(miss.reasons.some((r) => r.signal === 'founder-stage' && r.points < 0))
})

test('founder stage is an apply-branch signal only', () => {
  const b = brief({ mode: 'explore', purpose: 'curiosity', founderStage: 'idea' })
  const { reasons } = scoreEdition(edition({ modes: ['explore'], founderStages: ['scaling'] }), b)
  assert.equal(reasons.some((r) => r.signal === 'founder-stage'), false)
})

test('enjoy mode does not hand over a difficult book', () => {
  const b = brief({ mode: 'enjoy', purpose: 'unwind' })
  const hard = scoreEdition(edition({ modes: ['enjoy'], difficulty: 5 }), b)
  const easy = scoreEdition(edition({ modes: ['enjoy'], difficulty: 1 }), b)
  assert.ok(easy.score > hard.score)
})

test('a book that wants longer sittings than the reader has is penalised, not hidden', () => {
  const b = brief({ sessionMinutes: 10 })
  const { reasons } = scoreEdition(edition({ minSessionMinutes: 40 }), b)
  const r = reasons.find((x) => x.signal === 'session')!
  assert.ok(r.points < 0)
  assert.match(r.text, /40 minutes/)
})

test('every point scored carries a reason, and the reasons sum to the score', () => {
  const { score, reasons } = scoreEdition(edition(), brief())
  assert.equal(score, reasons.reduce((s, r) => s + r.points, 0))
  assert.ok(reasons.length > 0)
})

/* ---------- P02: diversity, explanation, version ---------- */

test('selection prefers a new topic over a second book about the same thing', () => {
  const a = { edition: edition({ id: 'a', topics: ['validation'] }), score: 10, reasons: [] }
  const b = { edition: edition({ id: 'b', topics: ['validation'] }), score: 9, reasons: [] }
  const c = { edition: edition({ id: 'c', topics: ['management'] }), score: 1, reasons: [] }
  const picked = selectDiverse([a, b, c], 2).map((p) => p.edition.id)
  assert.deepEqual(picked, ['a', 'c'])
})

test('every decision is traceable to a ranker version and states its limits', () => {
  const result = rank(loaded.editions, brief())
  assert.ok(result.decisions.length > 0)
  for (const d of result.decisions) {
    assert.equal(d.rankerVersion, RANKER_VERSION)
    assert.ok(d.reasons.length > 0)
    assert.ok(d.whyNow.length > 0)
    assert.ok(d.limitations.some((l) => /not been confirmed/.test(l)), 'unverified rows must say so')
  }
})

test('at most three results, and never more than the catalogue really covers', () => {
  assert.ok(rank(loaded.editions, brief()).decisions.length <= 3)
  assert.equal(rank([], brief()).decisions.length, 0)
})

test('an empty result caused by language is reported as a language gap', () => {
  const result = rank([edition({ languages: ['en'] })], brief({ language: 'ta' }))
  assert.equal(result.decisions.length, 0)
  assert.equal(result.languageGap, true)
})

test('an empty result caused by taste is not blamed on language', () => {
  const result = rank([edition({ modes: ['enjoy'] })], brief({ mode: 'apply' }))
  assert.equal(result.languageGap, false)
})

test('ranking is stable for the same brief', () => {
  const a = rank(loaded.editions, brief()).decisions.map((d) => d.editionId)
  const b = rank(loaded.editions, brief()).decisions.map((d) => d.editionId)
  assert.deepEqual(a, b)
})
