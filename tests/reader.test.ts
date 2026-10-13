import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSituation, PHRASES } from '../src/domain/reader.ts'
import { catalogue } from '../src/data/catalogue.ts'

test('every topic the reader can produce exists on a real book', () => {
  const real = new Set(catalogue.items.flatMap((i) => i.profile.topics))
  const orphans = [...new Set(Object.values(PHRASES).flat())].filter((t) => !real.has(t))
  // A topic nothing is tagged with is worse than no topic: focusFit scores it
  // 0 for every book, so reading the sentence makes the answer WORSE than
  // leaving the box empty. This assertion is what makes the parser safe to
  // extend — add a phrase for a topic nobody wrote, and the suite says so.
  assert.deepEqual(orphans, [], `phrases map to topics no book has: ${orphans.join(', ')}`)
})

test('the longest phrase wins, and a word inside it is not counted twice', () => {
  const r = readSituation('I need to talk to customers this week')
  assert.deepEqual(r.matched.map((m) => m.phrase), ['talk to customers'])
})

test('reads a real sentence into topics the ranker can use', () => {
  const r = readSituation('Whether to charge for the pilot or keep it free')
  assert.ok(r.topics.includes('pricing'))
  assert.ok(r.topics.includes('money'))
  assert.equal(r.unread, false)
})

test('says so when it understood nothing, rather than guessing', () => {
  const r = readSituation('zzz qqq wibble')
  assert.deepEqual(r.topics, [])
  assert.equal(r.unread, true)
})

test('an empty box is not an unread sentence', () => {
  // The difference matters on screen: "I did not understand that" must not
  // appear when there was nothing to understand.
  assert.equal(readSituation('').unread, false)
  assert.equal(readSituation('   ').unread, false)
})

test('never returns more topics than focusFit can use', () => {
  const r = readSituation('pricing customers hiring strategy burnout product marketing runway')
  assert.ok(r.topics.length <= 4, `got ${r.topics.length}`)
})

test('punctuation and case do not hide a phrase', () => {
  for (const s of ["Can't focus.", "CAN'T FOCUS", "can't   focus!"]) {
    assert.ok(readSituation(s).topics.includes('attention'), s)
  }
})

test('a sentence changes the answer', async () => {
  const { rank } = await import('../src/domain/ranker.ts')
  const { ReadingBrief } = await import('../src/domain/contracts.ts')
  const base = ReadingBrief.parse({
    purpose: 'company-building', mode: 'apply', language: 'en', sessionMinutes: 20,
    founderContext: { stage: 'VALIDATE', currentDecision: '', actionHoursPerWeek: 2, activeApplyBooks: 0 },
  })
  const without = rank(catalogue, base).decisions[0]?.workId
  const read = readSituation('I am stuck on how much to charge')
  const with_ = rank(catalogue, { ...base, confirmedTopics: read.topics }).decisions[0]?.workId
  assert.notEqual(without, undefined, 'the control run returned nothing')
  // Not asserting WHICH book: that pins the catalogue. Asserting that saying
  // something moved the answer, which is the entire point of the feature.
  assert.notEqual(with_, without, 'typing a sentence did not change the recommendation')
})

test('saying more does not make the answer vaguer', async () => {
  const { focusTopics } = await import('../src/domain/reader.ts')
  const merged = focusTopics(
    ['management', 'communication', 'team', 'company-building'],
    ['validation', 'experiments', 'customer-research'],
  )
  // Seven topics would make almost every book hit two and tie at full marks on
  // the focus term, so a reader who told Nidus MORE would get a vaguer answer.
  assert.equal(merged.length, 4)
  // The sentence is the more specific, more recent statement; it wins the slots.
  assert.deepEqual(merged, ['management', 'communication', 'team', 'company-building'])
})

test('the tapped aspiration fills the slots a short sentence leaves', async () => {
  const { focusTopics } = await import('../src/domain/reader.ts')
  assert.deepEqual(focusTopics(['pricing'], ['validation', 'experiments']),
    ['pricing', 'validation', 'experiments'])
})

test('the explanation under the purpose bar describes the score beside it', async () => {
  const { rank } = await import('../src/domain/ranker.ts')
  const { ReadingBrief } = await import('../src/domain/contracts.ts')
  const base = {
    purpose: 'company-building', mode: 'apply', language: 'en', sessionMinutes: 20,
    founderContext: { stage: 'VALIDATE', currentDecision: '', actionHoursPerWeek: 2, activeApplyBooks: 0 },
  }
  const read = readSituation('I need to let someone go')
  const d = rank(catalogue, ReadingBrief.parse({ ...base, confirmedTopics: read.topics })).decisions[0]
  const purposeBar = d.components.find((c) => c.signal === 'purpose')!
  const named = /Covers (.+?), which is what you named/.exec(purposeBar.text)
  if (named) {
    // Whatever it claims to cover must be a topic the reader actually named,
    // and a topic the book actually has. A sentence that cites the purpose
    // while the number came from the typed words is the failure this catches.
    const item = catalogue.items.find((i) => i.work.id === d.workId)!
    for (const t of named[1].split(' and ')) {
      const topic = t.replaceAll(' ', '-')
      assert.ok(read.topics.includes(topic), `claimed "${t}" but the reader never named it`)
      assert.ok(item.profile.topics.includes(topic), `claimed "${t}" but the book is not tagged with it`)
    }
  } else {
    assert.match(purposeBar.text, /Does not cover what you named/)
  }
})
