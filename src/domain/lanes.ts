import type { LoadedCatalogue } from './catalogue.ts'
import type { FounderStage } from './contracts.ts'

/**
 * What a shelf is made of, and what it is missing.
 *
 * The shelf map of 12 October counted Deepak's thirty-three books and found
 * eleven on mindset and zero on customers, then said plainly that this is
 * something Nidus can compute from data it already holds and that no
 * competitor does. It sat in a document for three weeks. This is it.
 *
 * It lives in the domain rather than in the component for the usual reason:
 * a rule nobody can test is a rule that quietly stops being true.
 */
export type Lane = {
  id: string
  label: string
  topics: string[]
  /** The founder stage at which an empty lane is worth saying out loud. */
  neededAt: FounderStage | null
}

export const LANES: Lane[] = [
  { id: 'customers', label: 'Talking to customers', neededAt: 'VALIDATE',
    topics: ['customer-research', 'validation', 'experiments', 'interviews'] },
  { id: 'saying', label: 'Saying what it is', neededAt: 'VALIDATE',
    topics: ['positioning', 'marketing', 'communication'] },
  { id: 'selling', label: 'Selling and pricing', neededAt: 'SELL',
    topics: ['selling', 'persuasion', 'negotiation', 'pricing'] },
  { id: 'building', label: 'Building the company', neededAt: null,
    topics: ['company-building', 'strategy', 'systems'] },
  { id: 'people', label: 'People and teams', neededAt: 'OPERATE_LEAD',
    topics: ['management', 'team', 'feedback'] },
  { id: 'money', label: 'Money', neededAt: null, topics: ['money', 'finance'] },
  { id: 'mindset', label: 'Mindset and self-direction', neededAt: null,
    topics: ['mindset', 'discipline', 'persistence', 'composure', 'endurance'] },
  { id: 'wider', label: 'Thinking wider', neededAt: null,
    topics: ['judgement', 'curiosity', 'history', 'science-fiction', 'mythology', 'dharma', 'travel'] },
]

export type LaneCount = Lane & { count: number }

/** Counts held books per lane, deepest first. A book can sit in two lanes. */
export function laneCounts(catalogue: LoadedCatalogue, held: string[]): LaneCount[] {
  const unique = [...new Set(held)]
  const topicsOf = (id: string) =>
    catalogue.items.find((i) => i.work.id === id)?.profile.topics ?? []
  return LANES
    .map((lane) => ({
      ...lane,
      count: unique.filter((id) => topicsOf(id).some((t) => lane.topics.includes(t))).length,
    }))
    .sort((a, b) => b.count - a.count)
}

/**
 * The finding, or null when there isn't one.
 *
 * Deliberately narrow. It fires only when a lane is genuinely deep AND a lane
 * this reader's stage actually needs is genuinely empty — not on every mild
 * imbalance, because a warning that fires often is a warning nobody reads.
 *
 * `null` stage means the reader never said what they are doing, and an
 * unprompted lecture about their shelf would be the product inventing a
 * problem it was not asked about.
 */
export function imbalance(
  lanes: LaneCount[],
  stage: FounderStage | null,
  deepEnough = 4,
): { deepest: LaneCount; missing: LaneCount } | null {
  if (stage === null || lanes.length === 0) return null
  const deepest = lanes[0]
  if (deepest.count < deepEnough) return null
  const missing = lanes.find((l) => l.count === 0 && l.neededAt === stage)
  if (!missing) return null
  // A reader whose deepest lane IS the one their stage needs has no problem.
  if (deepest.id === missing.id) return null
  return { deepest, missing }
}
