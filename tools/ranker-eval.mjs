/**
 * A regression net for ranking quality. NOT a quality measure.
 *
 *   node tools/ranker-eval.mjs
 *
 * WHAT THIS IS AND IS NOT — read before trusting a number it prints
 *
 * Every production recommender has an offline evaluation: precision@k, NDCG,
 * MAP, measured against held-out real interactions. Nidus cannot have one,
 * because it has no interactions. Nobody has used it.
 *
 * So the cases below are JUDGEMENTS, not data, and they were written by the
 * same process that wrote the ranker. That makes this worthless as evidence
 * that the recommendations are good — grading your own homework is exactly
 * what Experiment 001 exists to avoid.
 *
 * What it IS worth: catching the change that breaks something that used to
 * work. The focusFit cap survived weeks of edits because nothing measured
 * ranking at all — every check was "does the function return a number" or a
 * human reading three results. This file is the net under that.
 *
 *   quality  -> Experiment 001, eight blinded readers
 *   regression -> this file, run on every ranker change
 *
 * A case asserts one of three things, in decreasing strength:
 *   mustBeTop    the strongest-fit result, by id
 *   mustAppear   somewhere in the three results
 *   mustNotAppear   must not be offered at all
 */
import { ReadingBrief } from '../src/domain/contracts.ts'
import { catalogue } from '../src/data/catalogue.ts'
import { rank } from '../src/domain/ranker.ts'

/** Deepak's real shelf, so founder cases run against a realistic reader. */
const SHELF = ['rich-dad', 'cashflow-quadrant', 'guide-to-investing', 'psychology-of-money',
  'black-swan', 'money-trap', 'five-dysfunctions', 'radical-candor', 'no-rules-rules',
  'hard-thing', 'be-2-0', 'zero-to-one', 'five-rings', 'win-friends', 'art-of-persuasion',
  'e-myth', 'deep-work', 'innovators-dilemma', 'innovators-solution', 'fountainhead',
  'awaken-giant', 'think-grow-rich', 'grit', 'mindset', 'think-like-monk', 'art-of-impossible',
  'do-hard-things', 'courage-disliked', 'meditations', 'counsels-maxims', 'bhagavad-gita']

const founder = (over = {}) => ({
  purpose: 'company-building', mode: 'apply', language: 'en', sessionMinutes: 20,
  founderContext: { stage: 'VALIDATE', currentDecision: 'whether anyone will pay for Nidus',
    actionHoursPerWeek: 6, activeApplyBooks: 0 },
  intents: [{ workId: 'lean-startup', status: 'COMPLETED' }, ...SHELF.map((w) => ({ workId: w, status: 'OWNED' }))],
  ...over,
})
const reader = (over = {}) => ({
  purpose: 'curiosity', mode: 'enjoy', language: 'en', sessionMinutes: 20, intents: [], ...over,
})

const CASES = [
  /**
   * The first case this harness ran, and it failed — on a wrong expectation of
   * mine rather than a ranker bug. It asserted The $100 Startup by id, which is
   * the book the reader is already part-way through and which this fixture does
   * not even put on the shelf. The ranker returned Continuous Discovery Habits,
   * The Mom Test and Obviously Awesome, which are the right answers.
   *
   * Left in, rewritten to assert what it meant: a founder who does not yet know
   * whether anyone will pay gets customers and positioning, never governance or
   * operations. That is the claim worth defending; the title was never the point.
   */
  { why: 'a validating founder gets customers and positioning, not governance or operations',
    brief: founder(),
    check: (r) => r.decisions.every((d) => {
      const tags = catalogue.items.find((i) => i.work.id === d.workId).profile.competencyTags
      return !tags.includes('management')
    }) && r.decisions.some((d) => ['customer-research', 'validation', 'positioning', 'selling']
      .some((t) => catalogue.items.find((i) => i.work.id === d.workId).profile.topics.includes(t))),
    note: 'nothing management-flavoured, and at least one about customers or positioning' },

  { why: 'a book whose stage gate says too early is never the top answer',
    brief: founder(), mustNotAppear: ['hard-thing', 'good-to-great'] },

  { why: 'naming three business-judgement topics returns books about all three',
    brief: founder({ mode: 'explore', confirmedTopics: ['judgement', 'strategy', 'company-building'] }),
    mustAppear: ['zero-to-one'] },

  { why: 'an introvert asking about working alone is answered, which it was not before 28 October',
    brief: reader({ purpose: 'company-building', mode: 'explore', confirmedTopics: ['solitude', 'communication'] }),
    mustBeTop: 'quiet' },

  { why: 'a reader who rules out relationship drama does not get The Fountainhead',
    brief: reader({ confirmedTopics: ['craft', 'meaning'], avoid: ['relationship-drama'] }),
    mustNotAppear: ['fountainhead'] },

  { why: 'a finished book is never offered again',
    brief: founder({ intents: [{ workId: 'hundred-dollar-startup', status: 'COMPLETED' }] }),
    mustNotAppear: ['hundred-dollar-startup'] },

  { why: 'a book being read now is not offered as the next read',
    brief: founder({ intents: [{ workId: 'mom-test', status: 'READING' }] }),
    mustNotAppear: ['mom-test'] },

  { why: 'free-only means nothing that must be bought',
    brief: reader({ budget: 'free-only' }), mustNotAppear: ['quiet', 'mastery-greene'] },

  { why: 'a ten-minute session is not handed a book that needs twenty-five',
    brief: reader({ sessionMinutes: 10 }),
    check: (r) => r.decisions.every((d) =>
      catalogue.items.find((i) => i.work.id === d.workId).profile.typicalSessionMinutes <= 25),
    note: 'long books may still appear, but not exclusively' },

  { why: 'rejecting a book as repetitive moves the topics, not just the title',
    brief: reader({ confirmedTopics: ['science-fiction'],
      rejections: [{ workId: 'flatland', reason: 'repetitive' }] }),
    check: (r) => r.decisions.some((d) => d.components.some((c) => c.signal === 'you-said-no')),
    note: 'at least one result carries the visible penalty' },

  { why: 'every result can explain itself — no silent score anywhere',
    brief: founder(),
    check: (r) => r.decisions.every((d) => d.components.every((c) => c.text && c.text.length > 10)) },

  { why: 'the shown arithmetic adds up to the shown score',
    brief: founder(),
    check: (r) => r.decisions.every((d) => {
      const sum = d.components.reduce((s, c) => s + c.points, 0)
      return Math.abs(Math.min(100, Math.max(0, sum)) - d.score) < 0.11
    }) },
]

let pass = 0
const failures = []
for (const t of CASES) {
  const r = rank(catalogue, ReadingBrief.parse(t.brief))
  const ids = r.decisions.map((d) => d.workId)
  const problems = []

  if (t.mustBeTop) {
    const top = r.decisions.find((d) => d.role === 'strongest-fit')
    if (top?.workId !== t.mustBeTop) problems.push(`top was ${top?.workId ?? 'nothing'}, wanted ${t.mustBeTop}`)
  }
  for (const id of t.mustAppear ?? []) if (!ids.includes(id)) problems.push(`${id} missing`)
  for (const id of t.mustNotAppear ?? []) if (ids.includes(id)) problems.push(`${id} should not be offered`)
  if (t.check && !t.check(r)) problems.push(t.note ?? 'check failed')

  if (problems.length === 0) { pass++; console.log(`  ok   ${t.why}`) }
  else { failures.push({ t, problems, ids }); console.log(`  FAIL ${t.why}`) }
}

console.log(`\n${pass}/${CASES.length} cases pass\n`)
for (const f of failures) {
  console.log(`FAIL: ${f.t.why}`)
  console.log(`      ${f.problems.join('; ')}`)
  console.log(`      returned: ${f.ids.join(', ')}\n`)
}
console.log('These cases are judgements, not evidence. Quality is Experiment 001.')
process.exitCode = failures.length === 0 ? 0 : 1
