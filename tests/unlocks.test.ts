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
  assert.deepEqual(ready.map((i) => i.work.id), ['hard-thing'])
  assert.equal(stillEarly.length, 0)
})

test('reading is not enough when the situation has not happened', () => {
  // Same finished book, earlier stage. The product must say "still too early"
  // rather than pretending the reading was the gate.
  const b = founder('VALIDATE', { intents: [{ workId: 'lean-startup', status: 'COMPLETED' }] })
  const { ready, stillEarly } = unlockedBy(loaded, 'lean-startup', b)
  assert.equal(ready.length, 0)
  assert.deepEqual(stillEarly.map((x) => x.item.work.id), ['hard-thing'])
  assert.match(stillEarly[0].because, /waits on the situation/)
})

test('a book already finished is never offered as an unlock', () => {
  const b = founder('OPERATE_LEAD', {
    intents: [
      { workId: 'lean-startup', status: 'COMPLETED' },
      { workId: 'hard-thing', status: 'COMPLETED' },
    ],
  })
  assert.equal(unlockedBy(loaded, 'lean-startup', b).ready.length, 0)
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
