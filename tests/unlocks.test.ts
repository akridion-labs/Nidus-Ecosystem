import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ReadingBrief } from '../src/domain/contracts.ts'
import type { ReadingBrief as Brief } from '../src/domain/contracts.ts'
import { loadCatalogue } from '../src/domain/catalogue.ts'
import { seedWorks, seedEditions, seedProfiles } from '../src/data/catalogue.seed.ts'
import { rank, unlockedBy, isEligible } from '../src/domain/ranker.ts'

const loaded = loadCatalogue(seedWorks, seedEditions, seedProfiles)

const brief = (over: Partial<Brief> = {}): Brief =>
  ReadingBrief.parse({
    purpose: 'company-building', mode: 'apply', language: 'en', sessionMinutes: 20, ...over,
  })

const founder = (stage: string, over: Record<string, unknown> = {}) =>
  brief({
    founderContext: { stage, currentDecision: '', actionHoursPerWeek: 2, activeApplyBooks: 0 },
    ...over,
  } as Partial<Brief>)

test('finishing a prerequisite opens the book that assumed it', () => {
  // The Hard Thing About Hard Things assumes The Lean Startup, and is marked
  // premature before there is a team. At OPERATE_LEAD both conditions are met.
  const b = founder('OPERATE_LEAD', { intents: [{ workId: 'lean-startup', status: 'COMPLETED' }] })
  const { ready, stillEarly } = unlockedBy(loaded, 'lean-startup', b)
  // Membership, not a snapshot. The catalogue is meant to grow, and a test
  // that pins the exact list fails every time a book is added without
  // anything being wrong — which teaches people to edit tests rather than
  // read them.
  assert.ok(ready.some((i) => i.work.id === 'hard-thing'), 'hard-thing should be open')
  assert.equal(stillEarly.some((x) => x.item.work.id === 'hard-thing'), false)
  for (const i of ready) {
    assert.ok(i.profile.prerequisites.includes('lean-startup'), `${i.work.id} does not assume it`)
  }
})

test('reading is not enough when the situation has not happened', () => {
  // Same finished book, earlier stage. The product must say "still too early"
  // rather than pretending the reading was the gate.
  const b = founder('VALIDATE', { intents: [{ workId: 'lean-startup', status: 'COMPLETED' }] })
  const { ready, stillEarly } = unlockedBy(loaded, 'lean-startup', b)
  assert.equal(ready.some((i) => i.work.id === 'hard-thing'), false, 'too early to be ready')
  const held = stillEarly.find((x) => x.item.work.id === 'hard-thing')
  assert.ok(held, 'hard-thing should be held back, not dropped')
  assert.match(held.because, /waits on the situation/)
})

test('a book already finished is never offered as an unlock', () => {
  const b = founder('OPERATE_LEAD', {
    intents: [
      { workId: 'lean-startup', status: 'COMPLETED' },
      { workId: 'hard-thing', status: 'COMPLETED' },
    ],
  })
  const { ready, stillEarly } = unlockedBy(loaded, 'lean-startup', b)
  for (const list of [ready, stillEarly.map((x) => x.item)]) {
    assert.equal(list.some((i) => i.work.id === 'hard-thing'), false, 'a finished book came back')
  }
})

test('a book on your pile is not offered as your next read', () => {
  // READING is a distinct state from COMPLETED: you have not finished it, so
  // it unlocks nothing — but it is also not what you should start tonight.
  const item = loaded.items.find((i) => i.work.id === 'mom-test')!
  const open = isEligible(item, brief())
  assert.equal(open.ok, true)

  const b = brief({ intents: [{ workId: 'mom-test', status: 'READING' }] })
  const verdict = isEligible(item, b)
  assert.equal(verdict.ok, false)
  assert.equal(verdict.ok === false && verdict.kind, 'reading')

  assert.equal(rank(loaded, b).decisions.some((d) => d.workId === 'mom-test'), false)
})

test('a book on your pile still unlocks nothing', () => {
  const b = founder('OPERATE_LEAD', { intents: [{ workId: 'lean-startup', status: 'READING' }] })
  // unlockedBy is only ever called with a FINISHED book, but if it were called
  // with one merely started, the prerequisite must not count as met.
  const { ready } = unlockedBy(loaded, 'mom-test', b)
  assert.equal(ready.length, 0)
})
