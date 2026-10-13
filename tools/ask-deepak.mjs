import { ReadingBrief } from '../src/domain/contracts.ts'
import { loadCatalogue } from '../src/domain/catalogue.ts'
import { seedWorks, seedEditions, seedProfiles } from '../src/data/catalogue.seed.ts'
import { rank, unlockedBy } from '../src/domain/ranker.ts'

const c = loadCatalogue(seedWorks, seedEditions, seedProfiles)

// Deepak's real state: finished The Lean Startup today, owns the shelf,
// validating, 20 minutes a sitting, wants to act on it.
const SHELF = ['rich-dad','cashflow-quadrant','guide-to-investing','psychology-of-money','black-swan',
  'money-trap','five-dysfunctions','radical-candor','no-rules-rules','hard-thing','be-2-0','zero-to-one',
  'five-rings','win-friends','art-of-persuasion','e-myth','hundred-dollar-startup','deep-work',
  'fountainhead','awaken-giant','think-grow-rich','grit','mindset','think-like-monk','art-of-impossible',
  'do-hard-things','courage-disliked','meditations','counsels-maxims','bhagavad-gita']

const brief = ReadingBrief.parse({
  purpose: 'company-building', mode: 'apply', language: 'en', sessionMinutes: 20,
  founderContext: { stage: 'VALIDATE', currentDecision: 'whether anyone will pay for Nidus', actionHoursPerWeek: 6, activeApplyBooks: 0 },
  intents: [
    { workId: 'lean-startup', status: 'COMPLETED' },
    ...SHELF.map((workId) => ({ workId, status: 'OWNED' })),
  ],
})

const r = rank(c, brief)
console.log('BRANCH:', r.branch, '| scored:', c.items.length - r.excluded.length, 'of', c.items.length, '\n')
for (const d of r.decisions) {
  const item = c.items.find((i) => i.work.id === d.workId)
  console.log(`${d.role.toUpperCase()}  ${item.work.title} — ${d.score}/100  [${d.accessRoute}]  ${d.recommendedUsage}`)
  console.log('   ', item.profile.inOneLine)
  for (const comp of d.components) console.log(`      ${comp.points > 0 ? '+' : ''}${comp.points}/${comp.maxPoints} ${comp.signal}`)
  if (d.realWorldAction) console.log('    ACTION:', d.realWorldAction)
  console.log()
}
const u = unlockedBy(c, 'lean-startup', brief)
console.log('UNLOCKED by finishing Lean Startup:', u.ready.map(i => i.work.title), '| still early:', u.stillEarly.map(x => x.item.work.title))

// where does the $100 Startup actually place?
console.log('\n$100 Startup in the decision set?', r.decisions.some(d => d.workId === 'hundred-dollar-startup'))
