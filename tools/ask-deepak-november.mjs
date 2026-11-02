import { ReadingBrief } from '../src/domain/contracts.ts'
import { loadCatalogue } from '../src/domain/catalogue.ts'
import { seedWorks, seedEditions, seedProfiles } from '../src/data/catalogue.seed.ts'
import { rank } from '../src/domain/ranker.ts'

const c = loadCatalogue(seedWorks, seedEditions, seedProfiles)

const SHELF = ['rich-dad','cashflow-quadrant','guide-to-investing','psychology-of-money','black-swan',
  'money-trap','five-dysfunctions','radical-candor','no-rules-rules','hard-thing','be-2-0','zero-to-one',
  'five-rings','win-friends','art-of-persuasion','e-myth','deep-work',
  'fountainhead','awaken-giant','think-grow-rich','grit','mindset','think-like-monk','art-of-impossible',
  'do-hard-things','courage-disliked','meditations','counsels-maxims','bhagavad-gita']

/** 2 November 2026: $100 Startup at chapter 9 of 14; The Mom Test owned, unread. */
const base = {
  purpose: 'company-building', mode: 'apply', language: 'en', sessionMinutes: 20,
  founderContext: { stage: 'VALIDATE', currentDecision: 'whether anyone will pay for Nidus', actionHoursPerWeek: 6, activeApplyBooks: 1 },
  intents: [
    { workId: 'lean-startup', status: 'COMPLETED' },
    { workId: 'hundred-dollar-startup', status: 'READING' },
    { workId: 'mom-test', status: 'OWNED' },
    ...SHELF.map((workId) => ({ workId, status: 'OWNED' })),
  ],
}

const r = rank(c, ReadingBrief.parse(base))
console.log(`\nNIDUS, ASKED ON 2 NOVEMBER — branch ${r.branch}, ${c.items.length - r.excluded.length} of ${c.items.length} eligible\n`)
for (const d of r.decisions) {
  const item = c.items.find((i) => i.work.id === d.workId)
  console.log(`${d.role.toUpperCase().padEnd(14)} ${item.work.title} — ${d.score}/100  [${d.accessRoute}]  usage: ${d.recommendedUsage}`)
}

/**
 * Score a single book by narrowing the catalogue to its author, so the figure
 * comes out of the real ranker rather than a reimplementation of it.
 */
function scoreOf(author, title) {
  const one = rank(c, ReadingBrief.parse({ ...base, author }))
  const d = one.decisions.find((x) => c.items.find((i) => i.work.id === x.workId)?.work.title === title)
  if (d) return `${d.score}/100 (usage: ${d.recommendedUsage})`
  // Not scored at all is a stronger statement than scored low, so say which
  // gate stopped it rather than reporting an absence.
  const gone = one.excluded.find((e) => e.item.work.title === title)
  return gone ? `EXCLUDED before scoring — ${gone.kind}: ${gone.reason}` : 'absent from the catalogue'
}

console.log('\n--- WHAT THE CART SCORES, BY HIS OWN RANKER ---\n')
console.log('Good to Great'.padEnd(30), scoreOf('Jim Collins', 'Good to Great'))
console.log('The Mom Test'.padEnd(30), scoreOf('Rob Fitzpatrick', 'The Mom Test'))
console.log('\nGood to Great profile: targetStages', c.items.find(i=>i.work.id==='good-to-great').profile.targetStages,
            '| tooEarlyStages', c.items.find(i=>i.work.id==='good-to-great').profile.tooEarlyStages,
            '\nDeepak is in VALIDATE.\n')

const greene = ['Mastery', 'The 48 Laws of Power', 'The Laws of Human Nature', 'The 50th Law']
console.log('Robert Greene titles present in the 91-work catalogue:',
  greene.filter((t) => c.items.some((i) => i.work.title === t)).length, 'of 4\n')
