/**
 * Confirm catalogue facts against Open Library, and never silently overwrite.
 *
 * Every seed row ships with `confirmedAt: null`, which the app says out loud:
 * "Catalogue rows are drafts and none has been confirmed against a
 * bibliographic source." Turning those nulls into real dates has been an open
 * item in every planning document since September. This is the tool for it.
 *
 * Run it on your own machine — Open Library is not reachable from the sandbox
 * this was written in:
 *
 *   node tools/import-openlibrary.mjs            # report only, changes nothing
 *   node tools/import-openlibrary.mjs --write    # write confirmations.json
 *
 * Three rules, and the second is the one that matters.
 *
 * 1. It never edits catalogue.seed.ts. It writes a separate confirmations
 *    file for a human to read and merge. A script that rewrites the catalogue
 *    unattended is a script that will one day rewrite it wrongly.
 *
 * 2. A DISAGREEMENT IS NOT A CORRECTION. Where Open Library's author or year
 *    differs from the seed, the row is reported as `conflict` and nothing is
 *    confirmed. Open Library is crowd-edited; it is a second opinion, not an
 *    authority, and "the API said so" is not provenance. Somebody looks at the
 *    conflicts.
 *
 * 3. Only an exact-enough match confirms. Title and author must both line up
 *    after normalising, or the row comes back `no-match`. A near miss
 *    confirming the wrong edition is worse than no confirmation, because the
 *    app would then stop saying the data is a draft.
 */
import { writeFile } from 'node:fs/promises'
import { seedWorks } from '../src/data/catalogue.seed.ts'

const WRITE = process.argv.includes('--write')
const API = 'https://openlibrary.org/search.json'
const today = new Date().toISOString().slice(0, 10)

const norm = (s) =>
  String(s).toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Surnames only: "Chip Heath and Dan Heath" vs "Chip Heath, Dan Heath". */
const surnames = (a) =>
  new Set(norm(a).split(/ and |, | with /).map((n) => n.split(' ').at(-1)).filter(Boolean))

const overlaps = (a, b) => [...surnames(a)].some((n) => surnames(b).has(n))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const out = { checkedAt: today, source: 'openlibrary', confirmed: [], conflicts: [], noMatch: [] }

for (const w of seedWorks) {
  if (!w?.id || !w?.title) continue
  const url = `${API}?q=${encodeURIComponent(`${w.title} ${w.author}`)}`
    + '&fields=title,author_name,first_publish_year,isbn,number_of_pages_median,key&limit=5'

  let docs = []
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'nidus-catalogue/0.1 (catalogue confirmation)' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    docs = (await res.json()).docs ?? []
  } catch (err) {
    out.noMatch.push({ id: w.id, reason: `request failed: ${err.message}` })
    continue
  }

  const hit = docs.find((d) =>
    norm(d.title) === norm(w.title) && (d.author_name ?? []).some((a) => overlaps(a, w.author)))

  if (!hit) {
    out.noMatch.push({ id: w.id, reason: 'no title+author match in the first five results' })
  } else if (w.firstPublished !== null && hit.first_publish_year && hit.first_publish_year !== w.firstPublished) {
    // Reported, never auto-applied. Open Library is crowd-edited and often
    // carries a reprint year; the seed may equally be wrong. A person decides.
    out.conflicts.push({
      id: w.id,
      field: 'firstPublished',
      ours: w.firstPublished,
      theirs: hit.first_publish_year,
      openLibrary: hit.key,
    })
  } else {
    out.confirmed.push({
      id: w.id,
      isbn13: (hit.isbn ?? []).find((i) => i.length === 13) ?? null,
      pages: hit.number_of_pages_median ?? null,
      firstPublished: w.firstPublished ?? hit.first_publish_year ?? null,
      openLibrary: hit.key,
      provenance: { source: 'openlibrary', confirmedAt: today },
    })
  }
  await sleep(250) // be a polite guest on a free, donation-funded API
}

const summary = `${out.confirmed.length} confirmed · ${out.conflicts.length} conflicts · ${out.noMatch.length} no match`
console.log(summary)
for (const c of out.conflicts) console.log(`  conflict ${c.id}: ours ${c.ours}, theirs ${c.theirs} (${c.openLibrary})`)
for (const n of out.noMatch) console.log(`  no match ${n.id}: ${n.reason}`)

if (WRITE) {
  await writeFile(new URL('../src/data/confirmations.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
  console.log('\nwrote src/data/confirmations.json — read it, then merge by hand')
} else {
  console.log('\nreport only. Pass --write to save confirmations.json.')
}
