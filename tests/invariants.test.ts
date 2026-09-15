import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ReadingBrief, MODES, PURPOSES, FOUNDER_STAGES, REJECTION_REASONS } from '../src/domain/contracts.ts'
import type { ReadingBrief as Brief } from '../src/domain/contracts.ts'
import { loadCatalogue, editionIn } from '../src/domain/catalogue.ts'
import { seedWorks, seedEditions, seedProfiles } from '../src/data/catalogue.seed.ts'
import { rank, isEligible } from '../src/domain/ranker.ts'

/**
 * Property tests. Instead of asserting what one brief returns, these generate
 * thousands of briefs and assert what must be true of EVERY answer. A rule
 * change that breaks one of these breaks a promise the product makes.
 */

const loaded = loadCatalogue(seedWorks, seedEditions, seedProfiles)

/** Deterministic PRNG, so any failure is reproducible from its seed. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000 }
}

const LANGUAGES = ['en', 'hi', 'te', 'ta', 'kn']
const SESSIONS = [5, 10, 20, 30, 45, 90, 240]
const TOPICS = ['validation', 'management', 'craft', 'focus', 'meaning', 'history', 'strategy', 'money']

function randomBrief(r: () => number): Brief {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
  const ids = loaded.items.map((i) => i.work.id)
  const some = <T,>(xs: readonly T[], p: number) => xs.filter(() => r() < p)
  const purpose = pick(PURPOSES)
  return ReadingBrief.parse({
    purpose,
    mode: pick(MODES),
    language: pick(LANGUAGES),
    sessionMinutes: pick(SESSIONS),
    adultConfirmed: r() > 0.02,
    founderContext: purpose === 'company-building' && r() > 0.3
      ? { stage: pick(FOUNDER_STAGES), currentDecision: r() > 0.5 ? 'whether to charge' : '',
          actionHoursPerWeek: Math.floor(r() * 10), activeApplyBooks: r() > 0.7 ? 1 : 0 }
      : null,
    intents: some(ids, 0.15).map((workId) => ({
      workId, status: pick(['OWNED', 'READING', 'COMPLETED', 'PURCHASE_PIPELINE', 'DEFERRED'] as const),
    })),
    rejections: some(ids, 0.1).map((workId) => ({ workId, reason: pick(REJECTION_REASONS) })),
    revisitCompleted: r() > 0.9,
    confirmedTopics: some(TOPICS, 0.2),
  })
}

test('invariants hold across 3,000 generated briefs', () => {
  const r = rng(20260915)
  for (let i = 0; i < 3000; i++) {
    const brief = randomBrief(r)
    const result = rank(loaded, brief)
    const where = `run ${i}, ${brief.purpose}/${brief.mode}/${brief.language}/${brief.sessionMinutes}m`

    assert.ok(result.decisions.length <= 3, `${where}: more than three results`)
    const ids = result.decisions.map((d) => d.workId)
    assert.equal(new Set(ids).size, ids.length, `${where}: the same book twice`)
    const roles = result.decisions.map((d) => d.role)
    assert.equal(new Set(roles).size, roles.length, `${where}: duplicate roles`)
    if (result.decisions.length > 0) {
      assert.equal(result.decisions[0].role, 'strongest-fit', `${where}: first result is not the strongest fit`)
    }

    for (const d of result.decisions) {
      const item = loaded.items.find((x) => x.work.id === d.workId)!

      // Gates are absolute.
      assert.ok(isEligible(item, brief).ok, `${where}: ${d.workId} was not eligible`)
      assert.ok(editionIn(item, brief.language), `${where}: ${d.workId} has no ${brief.language} edition`)
      assert.ok(item.profile.modes.includes(brief.mode), `${where}: ${d.workId} does not suit ${brief.mode}`)
      assert.equal(brief.rejections.some((x) => x.workId === d.workId), false, `${where}: returned a rejected book`)
      const intent = brief.intents.find((x) => x.workId === d.workId)
      assert.notEqual(intent?.status, 'DEFERRED', `${where}: returned a deferred book`)
      if (!brief.revisitCompleted) {
        assert.notEqual(intent?.status, 'COMPLETED', `${where}: returned a finished book`)
      }

      // A score is bounded, and always equal to its own explanation.
      assert.ok(d.score >= 0 && d.score <= 100, `${where}: score ${d.score} out of range`)
      const sum = Math.round(d.components.reduce((s, c) => s + c.points, 0) * 10) / 10
      const bounded = Math.round(Math.min(100, Math.max(0, sum)) * 10) / 10
      assert.equal(d.score, bounded, `${where}: ${d.workId} score does not match its components`)
      for (const c of d.components) {
        assert.ok(Math.abs(c.points) <= c.maxPoints + 1e-9, `${where}: ${c.signal} exceeded its ceiling`)
        assert.ok(c.text.length > 0, `${where}: ${c.signal} has no reader-facing text`)
      }

      // Promises made on every card.
      assert.ok(d.cannotDo.length > 0, `${where}: empty limits list`)
      assert.ok(d.whyThisBook.length > 0 && d.whyNow.length > 0 && d.whyThisMode.length > 0, where)
      assert.ok(d.firstStep.length > 0, where)
      assert.ok(d.rankerVersion.length > 0 && d.catalogueVersion.length > 0, where)
      if (brief.mode !== 'apply') {
        assert.equal(d.realWorldAction, null, `${where}: ${brief.mode} mode must not demand an artifact`)
      }

      // Branch routing, and no signal counted twice.
      const signals = d.components.map((c) => c.signal)
      if (d.branch === 'founder') {
        assert.equal(brief.mode, 'apply', where)
        assert.equal(brief.purpose, 'company-building', where)
        assert.ok(brief.founderContext, where)
        assert.equal(signals.includes('context'), false, `${where}: generic context term leaked into the founder branch`)
        assert.equal(signals.includes('timeDifficulty'), false, `${where}: generic time term leaked into the founder branch`)
      } else {
        assert.equal(signals.includes('stage'), false, `${where}: founder stage term leaked into the generic branch`)
        assert.equal(signals.includes('too-early'), false, where)
      }
    }

    if (!brief.adultConfirmed) {
      assert.equal(result.decisions.length, 0, `${where}: served a reader who did not confirm adulthood`)
    }
    if (result.languageGap) {
      assert.equal(loaded.items.some((x) => editionIn(x, brief.language)), false,
        `${where}: claimed a language gap that does not exist`)
    }
  }
})

test('ranking is deterministic: the same brief always gives the same answer', () => {
  const r = rng(7)
  for (let i = 0; i < 300; i++) {
    const brief = randomBrief(r)
    const a = rank(loaded, brief), b = rank(loaded, brief)
    assert.deepEqual(
      a.decisions.map((d) => [d.workId, d.role, d.score]),
      b.decisions.map((d) => [d.workId, d.role, d.score]),
    )
  }
})

test('rejecting a book never brings it back', () => {
  const r = rng(99)
  for (let i = 0; i < 300; i++) {
    const brief = randomBrief(r)
    const before = rank(loaded, brief)
    if (before.decisions.length === 0) continue
    const rejected = before.decisions[0].workId
    const after = rank(loaded, {
      ...brief, rejections: [...brief.rejections, { workId: rejected, reason: 'unappealing' as const }],
    })
    assert.equal(after.decisions.some((d) => d.workId === rejected), false, 'a rejected book came back')
    assert.ok(after.decisions.length <= before.decisions.length)
  }
})

test('more time never scores worse on the time-and-difficulty term', () => {
  const r = rng(1234)
  for (let i = 0; i < 200; i++) {
    const brief = randomBrief(r)
    if (brief.mode === 'apply' && brief.founderContext) continue // founder branch has no time term
    const short = rank(loaded, { ...brief, sessionMinutes: 10 })
    const long = rank(loaded, { ...brief, sessionMinutes: 45 })
    for (const d of short.decisions) {
      const same = long.decisions.find((x) => x.workId === d.workId)
      if (!same) continue
      const t = (x: typeof d) => x.components.find((c) => c.signal === 'timeDifficulty')?.points ?? 0
      assert.ok(t(same) >= t(d) - 1e-9, `${d.workId}: more time scored worse`)
    }
  }
})
