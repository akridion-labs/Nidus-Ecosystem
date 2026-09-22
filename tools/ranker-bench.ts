import { ReadingBrief } from '../src/domain/contracts.ts'
import { loadCatalogue } from '../src/domain/catalogue.ts'
import { seedWorks, seedEditions, seedProfiles } from '../src/data/catalogue.seed.ts'
import { rank } from '../src/domain/ranker.ts'

const real = loadCatalogue(seedWorks, seedEditions, seedProfiles)

// Synthetic catalogues at 100x and 1000x the seed, same shape.
function blow(n: number) {
  const works: unknown[] = [], editions: unknown[] = [], profiles: unknown[] = []
  const P = { source: 'bench', confirmedAt: null }
  const topics = ['validation','management','craft','focus','meaning','history','strategy','decision','money','india']
  for (let i = 0; i < n; i++) {
    works.push({ id: `w${i}`, title: `Work ${i}`, author: `A${i % 500}`, firstPublished: 2000, fiction: i % 3 === 0, provenance: P })
    editions.push({ id: `e${i}`, workId: `w${i}`, language: i % 4 === 0 ? 'hi' : 'en', isbn13: null, format: 'print', pages: null, provenance: P })
    profiles.push({
      workId: `w${i}`, inOneLine: `Synthetic book ${i}, for measuring the ranker.`,
      modes: ['apply','explore','enjoy'].slice(0, (i % 3) + 1),
      topics: [topics[i % 10], topics[(i + 3) % 10]],
      conceptualDifficulty: (i % 5) + 1, typicalSessionMinutes: 5 + (i % 6) * 5,
      actionability: i % 6, emotionalIntensity: i % 6,
      targetStages: i % 2 ? ['VALIDATE'] : [], competencyTags: [], prerequisites: [],
      tooEarlyStages: [], suggestedArtifact: null, provenance: P,
    })
  }
  return loadCatalogue(works, editions, profiles)
}

const brief = ReadingBrief.parse({
  purpose: 'company-building', mode: 'apply', language: 'en', sessionMinutes: 20,
  founderContext: { stage: 'VALIDATE', currentDecision: 'whether to charge', actionHoursPerWeek: 2, activeApplyBooks: 0 },
})

function bench(label: string, cat: ReturnType<typeof loadCatalogue>) {
  for (let i = 0; i < 200; i++) rank(cat, brief)      // warm
  const runs = 500
  const t = process.hrtime.bigint()
  for (let i = 0; i < runs; i++) rank(cat, brief)
  const ms = Number(process.hrtime.bigint() - t) / 1e6 / runs
  console.log(`${label.padEnd(26)} works=${String(cat.items.length).padStart(6)}  ${ms.toFixed(3)} ms/call`)
}

bench('seed catalogue', real)
bench('synthetic 1,000', blow(1000))
bench('synthetic 10,000', blow(10000))
bench('synthetic 50,000', blow(50000))
