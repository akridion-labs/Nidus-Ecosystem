/**
 * "I want business mindset books, to be self-aware and fight in this business
 * world." Asked of the ranker three different ways, because that sentence is
 * three different requests wearing one coat.
 *
 *   node tools/ask-business-mindset.mjs
 */
import { ReadingBrief } from '../src/domain/contracts.ts'
import { loadCatalogue } from '../src/domain/catalogue.ts'
import { seedWorks, seedEditions, seedProfiles } from '../src/data/catalogue.seed.ts'
import { rank } from '../src/domain/ranker.ts'

const c = loadCatalogue(seedWorks, seedEditions, seedProfiles)

const SHELF = ['rich-dad','cashflow-quadrant','guide-to-investing','psychology-of-money','black-swan',
  'money-trap','five-dysfunctions','radical-candor','no-rules-rules','hard-thing','be-2-0','zero-to-one',
  'five-rings','win-friends','art-of-persuasion','e-myth','deep-work','innovators-dilemma','innovators-solution',
  'fountainhead','awaken-giant','think-grow-rich','grit','mindset','think-like-monk','art-of-impossible',
  'do-hard-things','courage-disliked','meditations','counsels-maxims','bhagavad-gita','mom-test']

const base = {
  purpose: 'company-building', language: 'en', sessionMinutes: 20,
  founderContext: { stage: 'VALIDATE', currentDecision: 'whether anyone will pay for Nidus', actionHoursPerWeek: 6, activeApplyBooks: 0 },
  intents: [
    { workId: 'lean-startup', status: 'COMPLETED' },
    { workId: 'hundred-dollar-startup', status: 'COMPLETED' },
    ...SHELF.map((workId) => ({ workId, status: 'OWNED' })),
  ],
}

function ask(label, patch) {
  const r = rank(c, ReadingBrief.parse({ ...base, ...patch }))
  console.log(`\n### ${label}`)
  for (const d of r.decisions) {
    const i = c.items.find((x) => x.work.id === d.workId)
    console.log(`  ${d.score}/100  ${i.work.title.padEnd(34)} [${d.accessRoute}]`)
    console.log(`          ${i.profile.inOneLine}`)
  }
}

console.log('\nThe same sentence, asked three ways. The answers are not the same books.')
ask('"business mindset" read as BUSINESS JUDGEMENT — how business actually works',
  { mode: 'explore', confirmedTopics: ['judgement', 'strategy', 'company-building'] })
ask('"self-aware" read as SEEING YOUR OWN BLIND SPOTS — not self-improvement',
  { mode: 'explore', confirmedTopics: ['judgement', 'bias'] })
ask('"fight in this business world" read as COMPETITION AND NEGOTIATION',
  { mode: 'apply', confirmedTopics: ['negotiation', 'strategy', 'selling'] })

/**
 * The cheapest recommendation is a book he already owns, so check that before
 * suggesting a purchase.
 */
console.log('\n### Already on the shelf, unread, serving exactly this\n')
for (const id of ['hard-thing', 'zero-to-one', 'black-swan', 'five-rings', 'meditations', 'innovators-dilemma']) {
  const i = c.items.find((x) => x.work.id === id)
  if (i) console.log(`  ${i.work.title.padEnd(34)} ${i.profile.topics.join(', ')}`)
}

const mindset = c.items.filter((i) => i.profile.topics.includes('mindset'))
console.log(`\ncatalogue 'mindset' rows: ${mindset.length}   |   'judgement' rows: ${c.items.filter((i) => i.profile.topics.includes('judgement')).length}\n`)
