import type {
  CatalogueEdition,
  Mode,
  Purpose,
  ReadingBrief,
  RecommendationDecision,
  ScoreReason,
} from './contracts.ts'

/**
 * Bump this whenever weights or gates change. Every decision carries it so an
 * explanation can always be traced back to the rules that produced it.
 */
export const RANKER_VERSION = 'nidus-ranker-0.1.0-pilot'

/** ------------------------------------------------------------------
 *  1. Eligibility — hard gates. A book that fails here is never ranked,
 *     not even as an exploration result.
 *  ------------------------------------------------------------------ */

export type Ineligible = { edition: CatalogueEdition; reason: string }

export function isEligible(
  edition: CatalogueEdition,
  brief: ReadingBrief,
): { ok: true } | { ok: false; reason: string } {
  if (!edition.languages.includes(brief.language)) {
    return { ok: false, reason: `no confirmed ${brief.language} edition` }
  }
  if (brief.completedIds.includes(edition.id) && !brief.revisitCompleted) {
    return { ok: false, reason: 'already finished' }
  }
  if (brief.rejectedIds.includes(edition.id)) {
    return { ok: false, reason: 'set aside in this session' }
  }
  if (!edition.modes.includes(brief.mode)) {
    return { ok: false, reason: `not suited to ${brief.mode} mode` }
  }
  return { ok: true }
}

export function eligible(editions: CatalogueEdition[], brief: ReadingBrief) {
  const pass: CatalogueEdition[] = []
  const fail: Ineligible[] = []
  for (const edition of editions) {
    const verdict = isEligible(edition, brief)
    if (verdict.ok) pass.push(edition)
    else fail.push({ edition, reason: verdict.reason })
  }
  return { pass, fail }
}

/** ------------------------------------------------------------------
 *  2. Mode routing — which signals matter for how the reader wants to
 *     use the book. Kept separate from scoring so weights stay readable.
 *  ------------------------------------------------------------------ */

type Weights = {
  purposeFit: number
  sessionFit: number
  difficultyComfort: number
  founderStageFit: number
  noveltyBonus: number
}

const MODE_WEIGHTS: Record<Mode, Weights> = {
  enjoy: { purposeFit: 2, sessionFit: 3, difficultyComfort: 3, founderStageFit: 0, noveltyBonus: 1 },
  explore: { purposeFit: 3, sessionFit: 2, difficultyComfort: 1, founderStageFit: 0, noveltyBonus: 3 },
  apply: { purposeFit: 3, sessionFit: 2, difficultyComfort: 1, founderStageFit: 4, noveltyBonus: 0 },
}

export function weightsFor(mode: Mode): Weights {
  return MODE_WEIGHTS[mode]
}

/** Editorial mapping, revisable. Purpose explains WHY, mode explains HOW. */
const PURPOSE_TOPICS: Record<Purpose, string[]> = {
  unwind: ['solitude', 'short-stories', 'everyday-life', 'journey', 'travel'],
  curiosity: ['curiosity', 'history', 'meaning', 'attention', 'bias'],
  craft: ['craft', 'focus', 'discipline', 'attention'],
  decision: ['decision', 'judgement', 'moral-choice', 'composure'],
  'company-building': ['company-building', 'validation', 'management', 'customer-research'],
}

/** ------------------------------------------------------------------
 *  3. Scoring — every point added must also produce a reader-readable
 *     reason, so no score can exist without its explanation.
 *  ------------------------------------------------------------------ */

export function scoreEdition(edition: CatalogueEdition, brief: ReadingBrief) {
  const w = weightsFor(brief.mode)
  const reasons: ScoreReason[] = []
  const add = (signal: string, points: number, text: string) => {
    if (points !== 0) reasons.push({ signal, points, text })
  }

  const wanted = PURPOSE_TOPICS[brief.purpose]
  const overlap = edition.topics.filter((t) => wanted.includes(t))
  if (overlap.length > 0) {
    add('purpose', w.purposeFit * Math.min(overlap.length, 2), `Covers ${overlap.slice(0, 2).join(' and ')}, which is what you came for.`)
  }

  if (edition.minSessionMinutes <= brief.sessionMinutes) {
    add('session', w.sessionFit, `Reads in useful chunks of about ${edition.minSessionMinutes} minutes, and you have ${brief.sessionMinutes}.`)
  } else {
    add('session', -w.sessionFit, `Wants roughly ${edition.minSessionMinutes} minutes a sitting; you have ${brief.sessionMinutes}.`)
  }

  // Enjoy mode should not hand someone a difficult book at the end of a long day.
  if (brief.mode === 'enjoy' && edition.difficulty >= 4) {
    add('difficulty', -w.difficultyComfort, 'Demanding for a mode meant to be easy company.')
  } else if (brief.mode === 'enjoy' && edition.difficulty <= 2) {
    add('difficulty', w.difficultyComfort, 'Light enough to pick up without warming into it.')
  }

  // Founder-stage fit is an Apply-branch signal only, and it can subtract:
  // a scaling book handed to someone at idea stage is a real mismatch.
  if (brief.mode === 'apply' && brief.founderStage !== 'none' && edition.founderStages.length > 0) {
    if (edition.founderStages.includes(brief.founderStage)) {
      add('founder-stage', w.founderStageFit, `Written for the ${brief.founderStage.replace('-', ' ')} stage you are in.`)
    } else {
      add('founder-stage', -w.founderStageFit, `Aimed at ${edition.founderStages.join(' / ').replace(/-/g, ' ')}, not ${brief.founderStage.replace('-', ' ')}.`)
    }
  }

  if (edition.fiction && brief.mode === 'explore') {
    add('novelty', w.noveltyBonus, 'A story rather than an argument, which is a different way in.')
  }

  const score = reasons.reduce((sum, r) => sum + r.points, 0)
  return { score, reasons }
}

/** ------------------------------------------------------------------
 *  4. Diversity — never three variations of the same book.
 *  ------------------------------------------------------------------ */

type Scored = { edition: CatalogueEdition; score: number; reasons: ScoreReason[] }

export function selectDiverse(scored: Scored[], limit: number): Scored[] {
  const ordered = [...scored].sort((a, b) => b.score - a.score || a.edition.id.localeCompare(b.edition.id))
  const picked: Scored[] = []
  const usedTopics = new Set<string>()

  for (const pass of [1, 2]) {
    for (const candidate of ordered) {
      if (picked.length >= limit) break
      if (picked.includes(candidate)) continue
      const overlaps = candidate.edition.topics.some((t) => usedTopics.has(t))
      // First pass takes only books that add a new topic; second pass fills up.
      if (pass === 1 && overlaps) continue
      picked.push(candidate)
      candidate.edition.topics.forEach((t) => usedTopics.add(t))
    }
  }
  return picked
}

/** ------------------------------------------------------------------
 *  5. Explanation — why now, and what this recommendation cannot promise.
 *  ------------------------------------------------------------------ */

export function limitationsFor(edition: CatalogueEdition, brief: ReadingBrief): string[] {
  const out: string[] = []
  if (edition.provenance.confirmedAt === null) {
    out.push('Edition details are a draft and have not been confirmed against a source.')
  }
  if (edition.isbn13 === null) {
    out.push('No ISBN recorded, so the exact edition is not pinned down.')
  }
  if (edition.minSessionMinutes > brief.sessionMinutes) {
    out.push(`Probably wants longer sittings than the ${brief.sessionMinutes} minutes you have.`)
  }
  if (edition.difficulty >= 4) {
    out.push('Slow going in places; expect to reread.')
  }
  if (edition.provenance.note) {
    out.push(edition.provenance.note)
  }
  out.push('Nidus does not know whether a copy is in stock near you.')
  return out
}

function whyNow(brief: ReadingBrief): string {
  if (brief.mode === 'apply' && brief.founderStage !== 'none') {
    return `You asked for something you can act on at the ${brief.founderStage.replace('-', ' ')} stage, in sittings of about ${brief.sessionMinutes} minutes.`
  }
  if (brief.mode === 'enjoy') {
    return `You asked for company rather than homework, with about ${brief.sessionMinutes} minutes to give it.`
  }
  return `You asked to look further into ${brief.purpose.replace('-', ' ')}, with about ${brief.sessionMinutes} minutes a sitting.`
}

/** ------------------------------------------------------------------
 *  The whole pipeline. Returns at most `limit` decisions plus the honest
 *  reasons everything else was left out.
 *  ------------------------------------------------------------------ */

export type RankResult = {
  rankerVersion: string
  decisions: RecommendationDecision[]
  excluded: Ineligible[]
  /** Set when the language gate, not taste, is what emptied the list. */
  languageGap: boolean
}

export function rank(
  editions: CatalogueEdition[],
  brief: ReadingBrief,
  limit = 3,
): RankResult {
  const { pass, fail } = eligible(editions, brief)
  const scored = pass.map((edition) => ({ edition, ...scoreEdition(edition, brief) }))
  const picked = selectDiverse(scored, limit)

  const decisions: RecommendationDecision[] = picked.map((p) => ({
    rankerVersion: RANKER_VERSION,
    editionId: p.edition.id,
    score: p.score,
    reasons: p.reasons,
    whyNow: whyNow(brief),
    limitations: limitationsFor(p.edition, brief),
  }))

  const languageGap =
    decisions.length === 0 &&
    fail.length > 0 &&
    fail.every((f) => f.reason.startsWith('no confirmed'))

  return { rankerVersion: RANKER_VERSION, decisions, excluded: fail, languageGap }
}
