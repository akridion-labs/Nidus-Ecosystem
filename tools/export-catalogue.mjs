// Export the catalogue as data we own and can pull into anything: CSV for a
// spreadsheet, JSON for the server or any other tool.
//
// It exports only what loadCatalogue ACCEPTED, so the files can never contain a
// row the product itself would reject. provenance.confirmedAt rides along on
// every row, because a row nothing has checked and a row Open Library confirmed
// must not look the same once this leaves the repo.
//
//   node tools/export-catalogue.mjs [outDir]
import { writeFile } from 'node:fs/promises'
import { catalogue } from '../src/data/catalogue.ts'
import { SHELVES, shelfItems } from '../src/domain/shelves.ts'
import { PUBLIC_DOMAIN_WORKS } from '../src/data/catalogue.seed.ts'

const outDir = process.argv[2] ?? '.'
const shelvesOf = new Map()
for (const s of SHELVES) for (const i of shelfItems(catalogue, s)) {
  shelvesOf.set(i.work.id, [...(shelvesOf.get(i.work.id) ?? []), s.name])
}

const rows = catalogue.items.map(({ work, editions, profile }) => ({
  id: work.id,
  title: work.title,
  author: work.author,
  firstPublished: work.firstPublished,
  fiction: work.fiction,
  publicDomain: PUBLIC_DOMAIN_WORKS.includes(work.id),
  inOneLine: profile.inOneLine,
  topics: profile.topics,
  modes: profile.modes,
  conceptualDifficulty: profile.conceptualDifficulty,
  typicalSessionMinutes: profile.typicalSessionMinutes,
  actionability: profile.actionability,
  emotionalIntensity: profile.emotionalIntensity,
  targetStages: profile.targetStages,
  competencyTags: profile.competencyTags,
  prerequisites: profile.prerequisites,
  shelves: shelvesOf.get(work.id) ?? [],
  languages: [...new Set(editions.map((e) => e.language))],
  formats: [...new Set(editions.map((e) => e.format))],
  pages: editions.find((e) => e.pages !== null)?.pages ?? null,
  isbn13: editions.find((e) => e.isbn13 !== null)?.isbn13 ?? null,
  factsConfirmedAt: work.provenance.confirmedAt,
  profileSource: profile.provenance.source,
}))

const cell = (v) => {
  const s = Array.isArray(v) ? v.join('; ') : v === null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}
const cols = Object.keys(rows[0])
const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')

await writeFile(`${outDir}/nidus-catalogue.csv`, csv + '\n')
await writeFile(`${outDir}/nidus-catalogue.json`, JSON.stringify({
  catalogueVersion: catalogue.version,
  exportedAt: new Date().toISOString().slice(0, 10),
  // Stated here rather than left for a reader to discover: nothing in this
  // export has been checked against a bibliographic source yet.
  confirmed: rows.filter((r) => r.factsConfirmedAt !== null).length,
  unconfirmed: rows.filter((r) => r.factsConfirmedAt === null).length,
  works: rows,
}, null, 2) + '\n')

console.log(`${rows.length} works, ${catalogue.rejected.length} rejected, ${catalogue.languages.length} languages`)
console.log(`${rows.filter((r) => r.factsConfirmedAt === null).length} of ${rows.length} rows unconfirmed against any source`)
