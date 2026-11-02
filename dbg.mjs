import { ReadingBrief } from './src/domain/contracts.ts'
import { loadCatalogue } from './src/domain/catalogue.ts'
import { seedWorks, seedEditions, seedProfiles } from './src/data/catalogue.seed.ts'
import { rank } from './src/domain/ranker.ts'
const c = loadCatalogue(seedWorks, seedEditions, seedProfiles)
const b = ReadingBrief.parse({ purpose:'company-building', mode:'apply', language:'en', sessionMinutes:20, author:'Jim Collins',
  founderContext:{stage:'VALIDATE',currentDecision:'x',actionHoursPerWeek:6,activeApplyBooks:1}, intents:[] })
const r = rank(c, b)
console.log('decisions:', r.decisions.map(d=>[d.workId,d.score]))
console.log('excluded collins:', r.excluded.filter(e=>c.items.find(i=>i.work.id===e.item.work.id)?.work.author?.includes('Collins')).map(e=>[e.item.work.id,e.kind,e.reason]))
