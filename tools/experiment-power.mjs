/**
 * What eight readers can and cannot settle.
 *
 *   node tools/experiment-power.mjs
 *
 * Experiment 001 is a blind forced choice: one reader, one real situation, six
 * candidate titles shown as bare titles in random order, pick the one you would
 * start tonight. This file works out, BEFORE any data exists, which outcomes
 * mean something and which are noise wearing a result's clothes.
 *
 * The honest headline is that n = 8 cannot establish that Nidus works. It can
 * only kill. That is still worth running, because the kill is cheap and the
 * alternative is building for another eight turns on an untested premise — but
 * the asymmetry has to be written down first, or a 4-of-8 gets read as proof in
 * hindsight.
 *
 * Under the null every arm is equally appealing, so each pick is a draw from
 * Binomial(n, 1/arms). No continuity corrections, no normal approximation: with
 * n = 8 the exact distribution is eight lines of arithmetic and the
 * approximation would be wrong in the tail, which is the only part we use.
 */

const ARMS = 6
const READERS = 8
const ALPHA = 0.05

const choose = (n, k) => {
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}

export const pmf = (k, n = READERS, p = 1 / ARMS) =>
  choose(n, k) * p ** k * (1 - p) ** (n - k)

/** P(X >= k): the chance the null alone produces a result this good or better. */
export const atLeast = (k, n = READERS, p = 1 / ARMS) => {
  let s = 0
  for (let i = k; i <= n; i++) s += pmf(i, n, p)
  return s
}

/** The smallest win count whose one-sided exact p-value clears ALPHA. */
export function threshold(n = READERS, p = 1 / ARMS, alpha = ALPHA) {
  for (let k = 0; k <= n; k++) if (atLeast(k, n, p) <= alpha) return k
  return null
}

/**
 * The other half, and the half people skip: if the premise were TRUE, would
 * eight readers show it? Power at a plausible effect — Nidus genuinely picked
 * half the time against five rivals — tells us whether a null result means
 * "wrong" or only "too small to see".
 */
export const powerAt = (trueP, k = threshold(), n = READERS) => atLeast(k, n, trueP)

function main() {
  const k = threshold()
  console.log(`\nExperiment 001 — ${READERS} readers, ${ARMS} arms, one pick each\n`)
  console.log(`Null: every arm equally appealing, p = 1/${ARMS} = ${(1 / ARMS).toFixed(3)}\n`)

  console.log('Nidus picks   exact P(>= that many) under the null   verdict')
  for (let i = 0; i <= READERS; i++) {
    const p = atLeast(i)
    const verdict = i >= k ? 'clears 0.05' : i <= 1 ? 'at or below chance' : 'noise'
    console.log(`  ${String(i).padStart(2)} of ${READERS}        ${p.toFixed(4).padStart(10)}                      ${verdict}`)
  }

  console.log(`\nPre-registered threshold: ${k} of ${READERS} (p = ${atLeast(k).toFixed(4)})\n`)

  console.log('Power — if the premise were true, would 8 readers show it?\n')
  for (const trueP of [0.3, 0.4, 0.5, 0.6, 0.75]) {
    console.log(
      `  Nidus truly picked ${(trueP * 100).toFixed(0)}% of the time  ->  ` +
      `${(powerAt(trueP, k) * 100).toFixed(0)}% chance of reaching ${k} of ${READERS}`,
    )
  }

  /**
   * The kill rule needs its own arithmetic, and it is the one number that
   * makes this run worth doing. A middling result proves nothing in either
   * direction at this size. But if Nidus really were picked half the time,
   * eight readers would hand it 0 or 1 pick only 3.5% of the time — so that
   * outcome IS decisive, while 2 or 3 is not decisive about anything.
   */
  console.log('\nHow likely is the kill outcome (0 or 1 pick) if the premise were TRUE?\n')
  for (const trueP of [0.3, 0.4, 0.5]) {
    const miss = pmf(0, READERS, trueP) + pmf(1, READERS, trueP)
    console.log(
      `  Nidus truly picked ${(trueP * 100).toFixed(0)}% of the time  ->  ` +
      `${(miss * 100).toFixed(1)}% chance of landing 0 or 1 of ${READERS}`,
    )
  }

  console.log(`\nSo the asymmetry, stated before the data: a win at ${k} of ${READERS} is weak`)
  console.log(`evidence of something. A middling 2 or 3 settles nothing either way and must`)
  console.log(`not be read as a loss. Only 0 or 1 of ${READERS} is decisive, and it is decisive`)
  console.log(`against the premise. This run is a tripwire, not a measurement.\n`)
  console.log(`Sample size needed before a WIN would mean much:`)
  for (const n of [8, 16, 24, 40]) {
    const kk = threshold(n)
    console.log(`  n = ${String(n).padStart(2)}  threshold ${kk}/${n}  power at a true 50%: ${(powerAt(0.5, kk, n) * 100).toFixed(0)}%`)
  }
  console.log()
}

if (import.meta.filename === process.argv[1]) main()
