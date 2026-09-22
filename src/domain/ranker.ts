import type {
  AccessRoute, FounderStage, Mode, Purpose, ReadingBrief,
  RecommendationDecision, RecommendedUsage, ResultRole, ScoreComponent,
} from './contracts.ts'
import type { CatalogueItem, LoadedCatalogue } from './catalogue.ts'
import { editionIn } from './catalogue.ts'
import { PUBLIC_DOMAIN_WORKS } from '../data/catalogue.seed.ts'

/**
 * Bump on ANY change to gates, weights or routing. Every decision carries this
 * and the catalogue version, so a changed recommendation can be explained
 * later instead of argued about.
 */
export const RANKER_VERSION = 'nidus-ranker-0.3.0-pilot'

/* ================================================================== *
 * 1. Eligibility — a binary gate that runs before any scoring.
 *    Nothing here is a penalty. A book that fails is not ranked at all,
 *    not even as the exploration result.
 * ================================================================== */

export type Ineligible = { item: CatalogueItem; reason: string; kind: EligibilityFailure }
export type EligibilityFailure =
  | 'audience' | 'language' | 'format' | 'budget' | 'author'
  | 'mode' | 'completed' | 'rejected' | 'deferred'

export function isEligible(
  item: CatalogueItem,
  brief: ReadingBrief,
): { ok: true } | { ok: false; kind: EligibilityFailure; reason: string } {
  if (!brief.adultConfirmed) {
    return { ok: false, kind: 'audience', reason: 'the pilot is for adults only' }
  }
  if (brief.author !== null && item.work.author !== brief.author) {
    return { ok: false, kind: 'author', reason: `not by ${brief.author}` }
  }
  if (!editionIn(item, brief.language)) {
    return { ok: false, kind: 'language', reason: `no confirmed ${brief.language} edition` }
  }
  // Format is its own gate, reported separately, so "we have this book but not
  // as an audiobook" never gets flattened into "we do not have this book".
  if (!editionIn(item, brief.language, brief.formatPreference)) {
    return {
      ok: false, kind: 'format',
      reason: `no confirmed ${brief.formatPreference} edition in ${brief.language}`,
    }
  }
  // The only affordability claim Nidus can make without a price feed: this one
  // would have to be bought, and the reader said they cannot buy.
  if (brief.budget === 'free-only' && accessRoute(item, brief) === 'to-obtain') {
    return { ok: false, kind: 'budget', reason: 'you would have to buy a copy of this one' }
  }
  const intent = brief.intents.find((i) => i.workId === item.work.id)
  if (intent?.status === 'COMPLETED' && !brief.revisitCompleted) {
    return { ok: false, kind: 'completed', reason: 'already finished' }
  }
  if (intent?.status === 'DEFERRED') {
    return { ok: false, kind: 'deferred', reason: 'you set this aside for later' }
  }
  if (brief.rejections.some((r) => r.workId === item.work.id)) {
    return { ok: false, kind: 'rejected', reason: 'set aside in this session' }
  }
  if (!item.profile.modes.includes(brief.mode)) {
    return { ok: false, kind: 'mode', reason: `not suited to ${brief.mode} mode` }
  }
  return { ok: true }
}

export function eligible(items: CatalogueItem[], brief: ReadingBrief) {
  const pass: CatalogueItem[] = []
  const fail: Ineligible[] = []
  for (const item of items) {
    const verdict = isEligible(item, brief)
    if (verdict.ok) pass.push(item)
    else fail.push({ item, reason: verdict.reason, kind: verdict.kind })
  }
  return { pass, fail }
}

/* ================================================================== *
 * 2. Access — the reader's route to the book. Never a stock claim.
 * ================================================================== */

export function accessRoute(item: CatalogueItem, brief: ReadingBrief): AccessRoute {
  const intent = brief.intents.find((i) => i.workId === item.work.id)
  if (intent?.status === 'OWNED' || intent?.status === 'READING') return 'on-your-shelf'
  if (PUBLIC_DOMAIN_WORKS.includes(item.work.id)) return 'public-domain'
  return 'to-obtain'
}

/** 0–1. Ownership affects access only; it never raises evidence quality. */
function accessFit(route: AccessRoute): number {
  return route === 'on-your-shelf' ? 1 : route === 'public-domain' ? 0.7 : 0.3
}

/* ================================================================== *
 * 3. Purpose → topics. Editorial mapping, revisable.
 * ================================================================== */

const PURPOSE_TOPICS: Record<Purpose, string[]> = {
  unwind: ['solitude', 'short-stories', 'everyday-life', 'journey', 'persistence'],
  curiosity: ['curiosity', 'history', 'meaning', 'attention', 'bias', 'travel', 'india'],
  craft: ['craft', 'focus', 'discipline', 'attention'],
  decision: ['decision', 'judgement', 'moral-choice', 'composure', 'strategy'],
  'company-building': ['company-building', 'validation', 'management', 'customer-research', 'experiments'],
}

function topicFit(item: CatalogueItem, purpose: Purpose): number {
  const wanted = PURPOSE_TOPICS[purpose]
  const hits = item.profile.topics.filter((t) => wanted.includes(t)).length
  return Math.min(hits, 2) / 2
}

/** Time and difficulty together, as the research report specifies one term. */
function timeAndDifficultyFit(item: CatalogueItem, brief: ReadingBrief): number {
  const fits = item.profile.typicalSessionMinutes <= brief.sessionMinutes
  const time = fits ? 1 : Math.max(0, brief.sessionMinutes / item.profile.typicalSessionMinutes)
  // Enjoy mode should not hand someone a demanding book at the end of a day.
  // Clamped to 1: an easy book is a full match, never a bonus. Without the
  // upper clamp a difficulty-1 book scored 1.33 here and pushed the component
  // past its own ceiling, so the displayed breakdown no longer summed to the
  // displayed score. Found by tests/invariants.test.ts.
  const comfort = brief.mode === 'enjoy'
    ? clamp(1 - (item.profile.conceptualDifficulty - 2) / 3, 0, 1)
    : 1
  return (time + comfort) / 2
}

function confirmedHistoryFit(item: CatalogueItem, brief: ReadingBrief): number {
  if (brief.confirmedTopics.length === 0) return 0.5 // unknown, not zero
  const hits = item.profile.topics.filter((t) => brief.confirmedTopics.includes(t)).length
  return Math.min(hits, 1)
}

/* ================================================================== *
 * 4a. Generic branch — the research report's pilot baseline.
 *     purpose 30 · mode 20 · context 15 · time+difficulty 15 ·
 *     access 10 · confirmed history 10 = 100.
 * ================================================================== */

const GENERIC_WEIGHTS = {
  purpose: 30, mode: 20, context: 15, timeDifficulty: 15, access: 10, history: 10,
} as const

function modeFit(item: CatalogueItem, mode: Mode): number {
  if (!item.profile.modes.includes(mode)) return 0
  // A book written for one mode fits it better than a book that suits three.
  const focus = 1 / item.profile.modes.length
  if (mode === 'apply') return Math.max(focus, item.profile.actionability / 5)
  if (mode === 'enjoy') return Math.max(focus, 1 - item.profile.emotionalIntensity / 5)
  return Math.max(focus, 0.6)
}

/** "Context readiness": is this a sensible book for the session in front of them. */
function contextFit(item: CatalogueItem, brief: ReadingBrief): number {
  // A heavy book in a short restful session is not ready-to-hand.
  const heavy = item.profile.emotionalIntensity >= 4 && brief.mode === 'enjoy'
  const long = item.profile.typicalSessionMinutes > brief.sessionMinutes
  return heavy ? 0 : long ? 0.4 : 1
}

function scoreGeneric(item: CatalogueItem, brief: ReadingBrief) {
  const route = accessRoute(item, brief)
  const parts: [keyof typeof GENERIC_WEIGHTS, number, string][] = [
    ['purpose', topicFit(item, brief.purpose),
      describeTopics(item, brief.purpose)],
    ['mode', modeFit(item, brief.mode),
      `Suits ${brief.mode} reading.`],
    ['context', contextFit(item, brief),
      contextFit(item, brief) >= 1
        ? 'Ready to pick up in the session you described.'
        : 'Asks for more room than this session gives it.'],
    ['timeDifficulty', timeAndDifficultyFit(item, brief),
      `Reads in chunks of about ${item.profile.typicalSessionMinutes} minutes; you have ${brief.sessionMinutes}.`],
    ['access', accessFit(route), describeAccess(route)],
    ['history', confirmedHistoryFit(item, brief),
      brief.confirmedTopics.length === 0
        ? 'You have not confirmed any preferences yet, so this counts as unknown.'
        : 'Matches a preference you confirmed yourself.'],
  ]

  const components: ScoreComponent[] = parts.map(([key, fit, text]) => ({
    signal: key,
    points: round(GENERIC_WEIGHTS[key] * fit),
    maxPoints: GENERIC_WEIGHTS[key],
    text,
  }))
  return { score: round(components.reduce((s, c) => s + c.points, 0)), components }
}

/* ================================================================== *
 * 4b. Founder branch — the blueprint's specialised Apply ranker.
 *     It REPLACES the generic purpose/mode/context terms rather than
 *     adding to them, so no signal is counted twice.
 * ================================================================== */

const FOUNDER_WEIGHTS = {
  purpose: 25, stage: 20, competencyGap: 15, decisionUrgency: 15,
  prerequisiteReadiness: 10, actionability: 5, access: 5, cognitiveVariety: 5,
} as const

const FOUNDER_PENALTIES = { redundancy: 15, tooEarly: 25, activeWorkload: 10 } as const

const STAGE_ORDER: FounderStage[] = ['EXPLORE', 'VALIDATE', 'STRUCTURE', 'SELL', 'OPERATE_LEAD', 'SCALE_RENEW']

function stageDistance(target: FounderStage[], stage: FounderStage): number {
  if (target.length === 0) return 99
  const at = STAGE_ORDER.indexOf(stage)
  return Math.min(...target.map((t) => Math.abs(STAGE_ORDER.indexOf(t) - at)))
}

function scoreFounder(item: CatalogueItem, brief: ReadingBrief) {
  const ctx = brief.founderContext!
  const p = item.profile
  const route = accessRoute(item, brief)
  const distance = stageDistance(p.targetStages, ctx.stage)
  const stageFit = distance === 99 ? 0.3 : Math.max(0, 1 - distance / 2)

  const missing = missingPrerequisites(item, brief)
  const tooEarly = p.tooEarlyStages.includes(ctx.stage)
  const overCap = ctx.activeApplyBooks >= 1

  const components: ScoreComponent[] = [
    {
      signal: 'purpose', maxPoints: FOUNDER_WEIGHTS.purpose,
      points: round(FOUNDER_WEIGHTS.purpose * topicFit(item, 'company-building')),
      text: describeTopics(item, 'company-building'),
    },
    {
      signal: 'stage', maxPoints: FOUNDER_WEIGHTS.stage,
      points: round(FOUNDER_WEIGHTS.stage * stageFit),
      text: p.targetStages.length === 0
        ? 'Not written for a particular venture stage.'
        : distance === 0
          ? `Written for the ${STAGE_WORD[ctx.stage]} stage you confirmed.`
          : `Aimed at ${p.targetStages.map((t) => STAGE_WORD[t]).join(' / ')}, ${distance} step${distance > 1 ? 's' : ''} from where you are.`,
    },
    {
      signal: 'competency-gap', maxPoints: FOUNDER_WEIGHTS.competencyGap,
      points: round(FOUNDER_WEIGHTS.competencyGap * (p.competencyTags.length > 0 ? 1 : 0.4)),
      text: p.competencyTags.length > 0
        ? `Works on ${p.competencyTags.join(' and ').replace(/-/g, ' ')}.`
        : 'No specific capability tagged for this book.',
    },
    {
      signal: 'decision-urgency', maxPoints: FOUNDER_WEIGHTS.decisionUrgency,
      points: round(FOUNDER_WEIGHTS.decisionUrgency * (ctx.currentDecision.trim() ? (distance === 0 ? 1 : 0.5) : 0.5)),
      text: ctx.currentDecision.trim()
        ? `Weighed against the decision you named: “${ctx.currentDecision.trim()}”.`
        : 'You did not name a current decision, so urgency counts as unknown.',
    },
    {
      signal: 'prerequisite-readiness', maxPoints: FOUNDER_WEIGHTS.prerequisiteReadiness,
      points: round(FOUNDER_WEIGHTS.prerequisiteReadiness * (missing.length === 0 ? 1 : 0)),
      text: missing.length === 0
        ? 'Nothing needs to be read first.'
        : `Assumes you have already worked through ${missing.join(', ')}.`,
    },
    {
      signal: 'actionability', maxPoints: FOUNDER_WEIGHTS.actionability,
      points: round(FOUNDER_WEIGHTS.actionability * (p.actionability / 5)),
      text: p.suggestedArtifact
        ? 'Produces something you can show for it.'
        : 'Gives you ideas rather than a concrete practice.',
    },
    {
      signal: 'access', maxPoints: FOUNDER_WEIGHTS.access,
      points: round(FOUNDER_WEIGHTS.access * accessFit(route)), text: describeAccess(route),
    },
    {
      signal: 'cognitive-variety', maxPoints: FOUNDER_WEIGHTS.cognitiveVariety,
      points: round(FOUNDER_WEIGHTS.cognitiveVariety * (item.work.fiction ? 1 : 0.4)),
      text: item.work.fiction ? 'A different shape of thinking from the rest of the plan.' : 'More of the same kind of material.',
    },
  ]

  if (tooEarly) {
    components.push({
      signal: 'too-early', points: -FOUNDER_PENALTIES.tooEarly, maxPoints: FOUNDER_PENALTIES.tooEarly,
      text: `Premature while ${STAGE_WORD[ctx.stage]}, however good the book is.`,
    })
  }
  if (missing.length > 0) {
    components.push({
      signal: 'redundancy-or-gap', points: -FOUNDER_PENALTIES.redundancy, maxPoints: FOUNDER_PENALTIES.redundancy,
      text: `Leans on ${missing.join(', ')}, which you have not finished.`,
    })
  }
  if (overCap) {
    components.push({
      signal: 'active-workload', points: -FOUNDER_PENALTIES.activeWorkload, maxPoints: FOUNDER_PENALTIES.activeWorkload,
      text: `You already have ${ctx.activeApplyBooks} Apply book${ctx.activeApplyBooks > 1 ? 's' : ''} open. One at a time works better.`,
    })
  }

  const raw = components.reduce((s, c) => s + c.points, 0)
  return { score: round(clamp(raw, 0, 100)), components }
}

function missingPrerequisites(item: CatalogueItem, brief: ReadingBrief): string[] {
  return item.profile.prerequisites.filter((id) => {
    const intent = brief.intents.find((i) => i.workId === id)
    return intent?.status !== 'COMPLETED'
  })
}

/* ================================================================== *
 * 5. Selection — strongest fit, adjacent fit, optional exploration.
 *    Never forced to three when only one passes eligibility.
 * ================================================================== */

type Scored = { item: CatalogueItem; score: number; components: ScoreComponent[] }

export function selectRoles(scored: Scored[]): { pick: Scored; role: ResultRole }[] {
  const ordered = [...scored].sort(
    (a, b) => b.score - a.score || a.item.work.id.localeCompare(b.item.work.id),
  )
  if (ordered.length === 0) return []

  const out: { pick: Scored; role: ResultRole }[] = [{ pick: ordered[0], role: 'strongest-fit' }]
  const strongestTopics = new Set(ordered[0].item.profile.topics)
  const taken = new Set([ordered[0]])

  // Adjacent: the best remaining book in the same neighbourhood.
  const adjacent = ordered.find(
    (c) => !taken.has(c) && c.item.profile.topics.some((t) => strongestTopics.has(t)),
  ) ?? ordered.find((c) => !taken.has(c))
  if (adjacent) {
    out.push({ pick: adjacent, role: 'adjacent-fit' })
    taken.add(adjacent)
  }

  // Exploration: a different direction, not simply third place.
  const usedTopics = new Set(out.flatMap((o) => o.pick.item.profile.topics))
  const exploration =
    ordered.find((c) => !taken.has(c) && c.item.work.fiction !== ordered[0].item.work.fiction
      && !c.item.profile.topics.some((t) => usedTopics.has(t)))
    ?? ordered.find((c) => !taken.has(c) && !c.item.profile.topics.some((t) => usedTopics.has(t)))
  if (exploration) out.push({ pick: exploration, role: 'exploration' })

  return out
}

/* ================================================================== *
 * 6. Explanation — separate fields, and never an empty "cannot do".
 * ================================================================== */

function readable(s: string) { return s.toLowerCase().replace(/_/g, ' ').replace(/-/g, ' ') }

/** Stages read as an activity, not as a database constant. */
const STAGE_WORD: Record<FounderStage, string> = {
  EXPLORE: 'exploring', VALIDATE: 'validating', STRUCTURE: 'structuring',
  SELL: 'selling', OPERATE_LEAD: 'operating and leading', SCALE_RENEW: 'scaling and renewing',
}
function round(n: number) { return Math.round(n * 10) / 10 }
function clamp(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)) }

function describeTopics(item: CatalogueItem, purpose: Purpose): string {
  const wanted = PURPOSE_TOPICS[purpose]
  const overlap = item.profile.topics.filter((t) => wanted.includes(t))
  return overlap.length > 0
    ? `Covers ${overlap.slice(0, 2).map(readable).join(' and ')}, which is what you said you came for.`
    : 'Does not directly cover what you said you came for.'
}

function describeAccess(route: AccessRoute): string {
  if (route === 'on-your-shelf') return 'Already on your shelf, so you can start now.'
  if (route === 'public-domain') return 'Out of copyright, so a free text is easy to find.'
  return 'You would have to get hold of a copy first.'
}

const MODE_REASON: Record<Mode, string> = {
  enjoy: 'Enjoy mode asks for nothing back. No quiz, no notes, no action.',
  explore: 'Explore mode gives you one question to carry while you read.',
  apply: 'Apply mode names an outcome, a first action and the evidence that would show it worked.',
}

function usageFor(
  item: CatalogueItem, brief: ReadingBrief, missing: string[], overCap: boolean,
): { usage: RecommendedUsage; deferReason: string | null } {
  const ctx = brief.founderContext
  if (ctx && item.profile.tooEarlyStages.includes(ctx.stage)) {
    return { usage: 'DEFER', deferReason: `Premature while ${STAGE_WORD[ctx.stage]}. Come back when the situation is real.` }
  }
  if (overCap) {
    return { usage: 'DEFER', deferReason: 'You already have an Apply book open. Finish that one first.' }
  }
  if (missing.length > 0) {
    return { usage: 'SELECTED_CHAPTERS', deferReason: null }
  }
  if (item.profile.typicalSessionMinutes > brief.sessionMinutes) {
    return { usage: 'SELECTED_CHAPTERS', deferReason: null }
  }
  return { usage: 'FULL_READ', deferReason: null }
}

function cannotDoFor(item: CatalogueItem, brief: ReadingBrief): string[] {
  const out: string[] = []
  if (item.work.provenance.confirmedAt === null) {
    out.push('Edition details are a draft and have not been confirmed against a source.')
  }
  if (!editionIn(item, brief.language, brief.formatPreference)?.isbn13) {
    out.push('No ISBN recorded, so the exact edition is not pinned down.')
  }
  if (item.profile.conceptualDifficulty >= 4) {
    out.push('Slow going in places; expect to reread.')
  }
  if (item.profile.emotionalIntensity >= 4) {
    out.push('Emotionally heavy. Not restful reading.')
  }
  if (brief.mode === 'apply') {
    out.push('Reading cannot replace customer contact, selling or management practice.')
  }
  if (item.work.provenance.note) out.push(item.work.provenance.note)
  if (item.profile.provenance.note) out.push(item.profile.provenance.note)
  out.push('Nidus does not know whether a copy is in stock near you.')
  return out
}

/* ================================================================== *
 * 7. The pipeline
 * ================================================================== */

export type RankResult = {
  rankerVersion: string
  catalogueVersion: string
  branch: 'generic' | 'founder'
  decisions: RecommendationDecision[]
  excluded: Ineligible[]
  /**
   * Why the list is empty, when a coverage gate emptied it rather than taste.
   * Null when there are results, or when the reader simply set everything
   * aside. Reported in priority order, so the reader is told the thing they
   * would have to change first.
   */
  gap: CoverageGap | null
}

export type CoverageGap = 'language' | 'format' | 'author' | 'budget'

export function rank(catalogue: LoadedCatalogue, brief: ReadingBrief): RankResult {
  const useFounderBranch =
    brief.mode === 'apply' && brief.purpose === 'company-building' && brief.founderContext !== null
  const branch = useFounderBranch ? 'founder' : 'generic'

  const { pass, fail } = eligible(catalogue.items, brief)
  const scored: Scored[] = pass.map((item) => ({
    item,
    ...(useFounderBranch ? scoreFounder(item, brief) : scoreGeneric(item, brief)),
  }))

  const decisions: RecommendationDecision[] = selectRoles(scored).map(({ pick, role }) => {
    const item = pick.item
    const edition = editionIn(item, brief.language, brief.formatPreference)!
    const missing = useFounderBranch ? missingPrerequisites(item, brief) : []
    const overCap = useFounderBranch && (brief.founderContext?.activeApplyBooks ?? 0) >= 1
    const { usage, deferReason } = usageFor(item, brief, missing, overCap)

    return {
      rankerVersion: RANKER_VERSION,
      catalogueVersion: catalogue.version,
      branch,
      role,
      workId: item.work.id,
      editionId: edition.id,
      score: pick.score,
      components: pick.components,
      whyThisBook: role === 'exploration'
        ? `Offered as a different direction rather than a close match. ${describeTopics(item, brief.purpose)}`
        : describeTopics(item, brief.purpose),
      whyNow: whyNow(brief, role),
      whyThisMode: MODE_REASON[brief.mode],
      firstStep: firstStep(item, brief),
      realWorldAction: brief.mode === 'apply' ? item.profile.suggestedArtifact : null,
      cannotDo: cannotDoFor(item, brief),
      accessRoute: accessRoute(item, brief),
      recommendedUsage: usage,
      missingPrerequisites: missing,
      deferReason,
    }
  })

  return {
    rankerVersion: RANKER_VERSION, catalogueVersion: catalogue.version,
    branch, decisions, excluded: fail,
    gap: decisions.length === 0 ? coverageGap(catalogue, brief) : null,
  }
}

/**
 * Which gate to name when nothing came through.
 *
 * Each branch is a statement about the CATALOGUE, not about which rows
 * happened to fail: "there is no Telugu edition of anything here" is a fact
 * a reader can act on, whereas "some rows failed the language gate" is true
 * of almost every session and tells them nothing. When none of these hold the
 * list was emptied by taste — wrong mode, already read, set aside — and the
 * generic empty state is the honest answer instead.
 *
 * Language comes first because no edition at all is a bigger fact than no
 * audio edition; being told about the format while the whole book is missing
 * would send the reader to fix the wrong thing.
 */
function coverageGap(catalogue: LoadedCatalogue, brief: ReadingBrief): CoverageGap | null {
  // Language and format are asked of the WHOLE catalogue, before the author
  // filter narrows it. Otherwise picking one author and one language would
  // report "no Telugu edition of anything here" when the truth is only "not
  // by this author" — a much bigger claim than the facts support.
  const inLanguage = catalogue.items.filter((i) => editionIn(i, brief.language))
  if (inLanguage.length === 0) return 'language'

  const inFormat = inLanguage.filter((i) => editionIn(i, brief.language, brief.formatPreference))
  if (inFormat.length === 0) return 'format'

  const byAuthor = brief.author === null
    ? inFormat
    : inFormat.filter((i) => i.work.author === brief.author)
  if (byAuthor.length === 0) return 'author'

  if (brief.budget === 'free-only'
      && byAuthor.every((i) => accessRoute(i, brief) === 'to-obtain')) return 'budget'

  return null
}

function whyNow(brief: ReadingBrief, role: ResultRole): string {
  const ctx = brief.founderContext
  const tail = `You have about ${brief.sessionMinutes} minutes a sitting.`
  const lead =
    role === 'exploration' ? 'A different direction, offered on purpose rather than because it scored well. ' :
    role === 'adjacent-fit' ? 'Close to the first one, in case that is not quite it. ' : ''
  if (ctx && brief.mode === 'apply') {
    return `${lead}You said you are ${STAGE_WORD[ctx.stage]}${ctx.currentDecision.trim() ? ` and the decision “${ctx.currentDecision.trim()}”` : ''}. ${tail}`
  }
  if (brief.mode === 'enjoy') return `${lead}You asked for company rather than homework. ${tail}`
  return `${lead}You asked to look further into ${readable(brief.purpose)}. ${tail}`
}

function firstStep(item: CatalogueItem, brief: ReadingBrief): string {
  const minutes = Math.min(item.profile.typicalSessionMinutes, brief.sessionMinutes)
  if (brief.mode === 'explore') {
    return `Read for ${minutes} minutes, carrying one question: what does this change about how you see ${readable(item.profile.topics[0] ?? 'the subject')}?`
  }
  if (brief.mode === 'apply') {
    return `Read for ${minutes} minutes, stopping at the first idea you could test this week.`
  }
  return `Read for ${minutes} minutes. Stop when you want to.`
}
