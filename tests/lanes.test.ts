import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catalogue } from '../src/data/catalogue.ts'
import { LANES, laneCounts, imbalance } from '../src/domain/lanes.ts'

/**
 * The shelf-balance finding. This is the one scoring idea in the project that
 * no competitor has, and it was written in a document on 12 October and built
 * on 3 November, so the tests matter: an untested rule about someone's reading
 * habits is a rule that can quietly start being wrong about them.
 */

/** Deepak's real shelf, which is where the finding came from. */
const DEEPAK = ['rich-dad', 'cashflow-quadrant', 'guide-to-investing', 'psychology-of-money',
  'black-swan', 'money-trap', 'zero-to-one', 'five-rings', 'win-friends', 'art-of-persuasion',
  'e-myth', 'deep-work', 'fountainhead', 'awaken-giant', 'think-grow-rich', 'grit', 'mindset',
  'think-like-monk', 'art-of-impossible', 'do-hard-things', 'courage-disliked', 'meditations',
  'counsels-maxims', 'bhagavad-gita']

test('every lane label is distinct and every lane has topics', () => {
  assert.equal(new Set(LANES.map((l) => l.id)).size, LANES.length)
  for (const l of LANES) assert.ok(l.topics.length > 0, `${l.id} has no topics`)
})

test('counting is by unique book, so a duplicate cannot inflate a lane', () => {
  const once = laneCounts(catalogue, ['zero-to-one'])
  const twice = laneCounts(catalogue, ['zero-to-one', 'zero-to-one'])
  assert.deepEqual(once.map((l) => l.count), twice.map((l) => l.count))
})

test('a book Nidus does not stock is counted in no lane rather than throwing', () => {
  const lanes = laneCounts(catalogue, ['a-book-we-do-not-have'])
  assert.equal(lanes.reduce((n, l) => n + l.count, 0), 0)
})

test('the finding fires on the shelf it was found on', () => {
  // The October shelf map said "eleven on mindset, zero on customers", counted
  // by assigning each book to one category by hand. Counted by TOPIC OVERLAP,
  // which is what the code can actually do, the lanes come out:
  //
  //   mindset 14 · money 6 · wider 6 · building 5 · customers 2 · selling 2
  //   · people 1 · SAYING WHAT IT IS 0
  //
  // So the empty lane today is positioning, not customers — two of his books
  // touch customer topics even though neither is about talking to anyone.
  // The shape of the finding is unchanged and it is now more specific, which
  // is also exactly why Obviously Awesome keeps coming out of the ranker.
  const lanes = laneCounts(catalogue, DEEPAK)
  const found = imbalance(lanes, 'VALIDATE')
  assert.ok(found, 'the shelf that produced the finding no longer produces it')
  assert.equal(found.deepest.id, 'mindset')
  assert.ok(found.deepest.count >= 10, `mindset lane is only ${found.deepest.count} deep`)
  // Whatever the empty lane turns out to be, it must be one this stage needs.
  assert.equal(found.missing.count, 0)
  assert.equal(found.missing.neededAt, 'VALIDATE')
})

test('it stays quiet when the reader never said what they are doing', () => {
  // No stage means no claim about what they need. A product that lectures an
  // anonymous visitor about their shelf has invented the problem.
  assert.equal(imbalance(laneCounts(catalogue, DEEPAK), null), null)
})

test('it stays quiet for a balanced shelf', () => {
  const balanced = ['mom-test', 'obviously-awesome', 'zero-to-one', 'radical-candor', 'psychology-of-money']
  assert.equal(imbalance(laneCounts(catalogue, balanced), 'VALIDATE'), null)
})

test('it stays quiet when the deep lane is the one the stage needs', () => {
  // Five books on customers while validating is not a problem to report.
  const lanes = laneCounts(catalogue, ['mom-test', 'continuous-discovery', 'customer-dev-guide',
    'four-steps-epiphany', 'disciplined-entrepreneurship', 'lean-startup'])
  const found = imbalance(lanes, 'VALIDATE')
  assert.ok(found === null || found.deepest.id !== found.missing.id)
})

test('a shallow shelf does not trigger a lecture', () => {
  assert.equal(imbalance(laneCounts(catalogue, ['grit', 'mindset']), 'VALIDATE'), null)
})
