/**
 * The reading arithmetic, derived from sources or not printed at all.
 *
 * WHAT THIS SCRIPT IS FOR
 *
 * Nidus's pitch is that choosing well matters more than reading a lot. The
 * obvious way to make that vivid is a big number: "X million books published a
 * year, you will read Y of them." This script exists to stop that number being
 * invented, and it emits only what it can stand behind.
 *
 * WHAT IT FOUND, WHICH IS THE POINT
 *
 * That number cannot be sourced. The International ISBN Agency publishes no
 * global registration total — no annual report, no statistics page. The one
 * real global survey (International Publishers Association with Nielsen
 * BookData) deliberately publishes no world total, because it covers only the
 * countries where the IPA has members and a sum of its rows would not be a
 * world figure. UNESCO stopped collecting book-production statistics; the last
 * tables are archived from 2004-2009. The widely repeated "2.6 million titles a
 * year" traces to a compiled table whose rows are 2013-2018.
 *
 * So the headline number is refused, every time this runs, by rule rather than
 * by judgement. That refusal is printed on the page: a product whose whole
 * claim is that it shows its working can say "nobody publishes this number"
 * far more credibly than it can say "2.6 million".
 *
 * TWO KINDS OF SOURCE, AND ONLY ONE STALENESS RULE
 *
 * A STATISTIC describes the world as it is now — how many books were published,
 * how much people read. It goes stale, so it expires after MAX_STATISTIC_AGE.
 *
 * A STUDY is a finding about how things work. A 2016 cohort study is not stale
 * data in the way a 2016 publishing count is, so studies do not expire. They
 * pay a different toll instead: every study must declare its design and carry
 * the authors' own most important limitation, and the renderer prints the
 * limitation in the same breath as the finding.
 *
 *   node tools/reading-arithmetic.mjs            # report
 *   node tools/reading-arithmetic.mjs --write     # also write src/data/reading-facts.json
 */

import { writeFileSync } from 'node:fs'

const TODAY = new Date().toISOString().slice(0, 10)
const MAX_STATISTIC_AGE_YEARS = 3

/* ------------------------------------------------------------------ *
 * The sources. Every one carries the year its DATA refers to, which is
 * not the year the page was published — the commonest way a stale number
 * passes for a fresh one.
 * ------------------------------------------------------------------ */

const SOURCES = [
  {
    id: 'us-reading-frequency',
    kind: 'statistic',
    claim: 'Two in five American adults read no books at all last year, and the median was two.',
    values: { readNoBooks: 0.40, medianBooks: 2, meanBooks: 8 },
    measure: 'self-reported books read in a calendar year',
    dataYear: 2025,
    org: 'YouGov',
    url: 'https://yougov.com/en-us/articles/53804-most-americans-didnt-read-many-books-in-2025',
    checkedOn: '2026-10-27',
    // Printed next to the number, not buried. An opt-in panel is not a census,
    // and this is the United States rather than India.
    caveat: 'Opt-in online panel of 2,203 US adults, self-reported, ±3 points. Not India, and not a census.',
  },
  {
    id: 'india-isbn-registrations',
    kind: 'statistic',
    claim: 'India registered 281,091 ISBNs.',
    values: { isbns: 281_091, publishers: 24_538 },
    // Registrations are not titles: one title can take several ISBNs, and some
    // registered ISBNs are never used. Conflating them is the standard error in
    // every article about this.
    measure: 'ISBN registrations, which are NOT the same as new titles published',
    dataYear: 2022,
    org: 'International Publishers Association with Nielsen BookData',
    url: 'https://internationalpublishers.org/wp-content/uploads/2023/11/ipa-nielsen-book-data-executive-summary.pdf',
    checkedOn: '2026-10-27',
    caveat: 'Registrations, not titles.',
  },
  {
    id: 'reading-and-longevity',
    kind: 'study',
    claim: 'Over twelve years, book readers aged 50+ died at a lower rate than non-readers.',
    finding: 'hazard ratio 0.80 after adjustment, with a dose-response across tertiles',
    design: 'correlational',
    detail: 'Prospective cohort, 3,635 adults aged 50 and over from the US Health and Retirement Study, Cox proportional hazards, adjusted for age, sex, race, education, comorbidities, self-rated health, wealth, marital status and depression.',
    // Not attributed to the authors: their limitations section could not be
    // retrieved, so this is stated as the design's own well-known limit rather
    // than put in their mouths.
    limitation: 'Observational, so it cannot show that reading caused the difference: people already healthier, wealthier or more cognitively able may simply read more.',
    citation: 'Bavishi, Slade & Levy, Social Science & Medicine 164:44-48 (2016)',
    url: 'https://doi.org/10.1016/j.socscimed.2016.07.014',
    checkedOn: '2026-10-27',
  },
  {
    id: 'fiction-and-other-minds',
    kind: 'study',
    claim: 'People who have read more fiction score slightly higher on reading emotion in faces.',
    finding: 'partial r = 0.34 with fiction exposure; r = -0.26 with non-fiction exposure',
    design: 'correlational',
    detail: 'Cross-sectional, 94 adults in Toronto, print exposure measured by author-name recognition rather than by reading.',
    // The authors' own, and the honest framing of a contested literature.
    limitation: 'The authors state the causal direction is undetermined — more empathic people may simply choose fiction. The experimental version of this claim has largely failed to replicate: a three-lab randomised study found d = 0.07 (null), and a meta-analysis of 14 studies found a fragile pooled g = 0.15 that drops to a trend when any single study is removed.',
    citation: 'Mar, Oatley, Hirsh, dela Paz & Peterson, Journal of Research in Personality 40:694-712 (2006); replication status from Panero et al., JPSP 111(9) (2016) and Dodell-Feder & Tamir, JEP:General (2018)',
    url: 'https://www.yorku.ca/mar/Mar%20et%20al%202006_bookworms%20versus%20nerds.pdf',
    checkedOn: '2026-10-27',
  },
]

/**
 * Things Nidus wanted to say and cannot. Printed on the page, because the
 * absence is more informative than the number would have been — and because a
 * gap left visible is a gap nobody quietly fills in later.
 */
const REFUSED = [
  {
    wanted: 'How many books are published worldwide each year',
    why: 'No such figure is published. The International ISBN Agency has no annual report and no statistics page; the IPA/Nielsen survey covers only member countries and deliberately gives no world total; UNESCO stopped collecting book-production data and its last tables are archived from 2004-2009.',
    whatGetsQuotedInstead: 'Around 2.6 million a year, which traces to a compiled table whose rows are dated 2013 to 2018.',
  },
  {
    wanted: 'How many titles are published in India each year',
    why: 'India\'s ISBN agency publishes live counters rendered by JavaScript and no dated report. The only citable Indian figure is 281,091 ISBN registrations for 2022, which is both out of date by this script\'s rule and a different measure from titles.',
    whatGetsQuotedInstead: '90,000 new titles, a 2013 figure.',
  },
  {
    wanted: 'What share of books people start that they finish',
    why: 'No representative measurement exists. The one dataset quoted is from readers given free advance copies in exchange for telemetry, which is maximally self-selected, and its denominator excludes everyone who never opened the book.',
    whatGetsQuotedInstead: 'Completion-rate bands from a publisher analytics vendor, undated.',
  },
]

/* ------------------------------------------------------------------ *
 * The gate
 * ------------------------------------------------------------------ */

const ageInYears = (dataYear) => Number(TODAY.slice(0, 4)) - dataYear

function screen(source) {
  if (source.kind === 'study') {
    // Studies do not expire. They pay a different toll.
    const missing = ['design', 'limitation', 'citation'].filter((k) => !source[k])
    return missing.length === 0
      ? { ok: true }
      : { ok: false, reason: `study is missing ${missing.join(', ')}` }
  }
  const age = ageInYears(source.dataYear)
  return age <= MAX_STATISTIC_AGE_YEARS
    ? { ok: true }
    : { ok: false, reason: `data year ${source.dataYear} is ${age} years old; the limit is ${MAX_STATISTIC_AGE_YEARS}` }
}

const screened = SOURCES.map((s) => ({ source: s, verdict: screen(s) }))
const usable = screened.filter((r) => r.verdict.ok).map((r) => r.source)
const rejected = screened.filter((r) => !r.verdict.ok)

/* ------------------------------------------------------------------ *
 * What can actually be derived from what survived
 * ------------------------------------------------------------------ */

const reading = usable.find((s) => s.id === 'us-reading-frequency')

/**
 * The argument that survives the sourcing, and it is a better one.
 *
 * The intended line was "millions of books, you will read a handful" — scarcity
 * of attention against an ocean. That cannot be sourced. What can is the other
 * end of the same telescope: the median adult reads two books in a year and two
 * in five read none. The scarcity is not the size of the library. It is that
 * most people get about two attempts a year, so which two is close to the whole
 * question.
 */
const derived = reading
  ? {
      medianBooksPerYear: reading.values.medianBooks,
      shareWhoReadNothing: reading.values.readNoBooks,
      // Deliberately computed, not asserted, so the page can show the division.
      weeksPerBookAtMedian: Math.round((52 / reading.values.medianBooks) * 10) / 10,
      aBookAWeekMultiple: Math.round(52 / reading.values.medianBooks),
      source: { org: reading.org, url: reading.url, dataYear: reading.dataYear, caveat: reading.caveat },
    }
  : null

/* ------------------------------------------------------------------ *
 * Report and emit
 * ------------------------------------------------------------------ */

const out = {
  generatedOn: TODAY,
  rule: `Statistics expire after ${MAX_STATISTIC_AGE_YEARS} years of data age. Studies do not expire but must declare design and limitation.`,
  derived,
  statistics: usable.filter((s) => s.kind === 'statistic'),
  studies: usable.filter((s) => s.kind === 'study'),
  refused: REFUSED,
  rejectedSources: rejected.map((r) => ({
    id: r.source.id, claim: r.source.claim, dataYear: r.source.dataYear, reason: r.verdict.reason,
  })),
}

console.log(`reading-arithmetic — ${TODAY}`)
console.log(`\nUSABLE (${usable.length})`)
for (const s of usable) console.log(`  + ${s.id}  [${s.kind}${s.kind === 'study' ? '/' + s.design : '/' + s.dataYear}]`)
console.log(`\nREJECTED BY THE STALENESS RULE (${rejected.length})`)
for (const r of rejected) console.log(`  - ${r.source.id}: ${r.verdict.reason}`)
console.log(`\nCANNOT BE SOURCED AT ALL (${REFUSED.length})`)
for (const r of REFUSED) console.log(`  ? ${r.wanted}`)
if (derived) {
  console.log(`\nDERIVED`)
  console.log(`  median books per year: ${derived.medianBooksPerYear}`)
  console.log(`  share who read none:   ${(derived.shareWhoReadNothing * 100).toFixed(0)}%`)
  console.log(`  weeks per book:        ${derived.weeksPerBookAtMedian}`)
  console.log(`  a book a week is:      ${derived.aBookAWeekMultiple}x the median`)
}

if (process.argv.includes('--write')) {
  const path = new URL('../src/data/reading-facts.json', import.meta.url)
  writeFileSync(path, JSON.stringify(out, null, 2) + '\n')
  console.log(`\nwrote ${path.pathname}`)
}

// A build that silently prints nothing would be worse than one that fails.
if (usable.length === 0) {
  console.error('\nNothing survived. The page must not claim anything.')
  process.exitCode = 1
}
