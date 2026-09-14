import { z } from 'zod'

/**
 * P01 contracts.
 *
 * Three separations the documents insist on and that are easy to lose:
 *   1. Work / Edition / physical Copy are distinct (E03-US02). A Work is the
 *      book; an Edition is a printing in one language; a Copy is a physical
 *      object. Copy belongs to circulation (P04+) and is deliberately absent.
 *   2. Catalogue FACTS (title, author, language, ISBN) are separate from
 *      EDITORIAL INFERENCES (modes, difficulty, founder stages). Each carries
 *      its own provenance so one can be corrected without touching the other.
 *   3. The reader's relation to a book (CatalogueIntent) is separate from both.
 *      A book on a purchase list is not owned inventory, and ownership affects
 *      access only — it never raises evidence quality.
 */

export const CATALOGUE_VERSION = 'nidus-catalogue-0.1.0-seed'

/* ------------------------------------------------------------------ *
 * Shared vocabulary
 * ------------------------------------------------------------------ */

export const MODES = ['enjoy', 'explore', 'apply'] as const
export const Mode = z.enum(MODES)
export type Mode = z.infer<typeof Mode>

export const PURPOSES = [
  'unwind',
  'curiosity',
  'craft',
  'decision',
  'company-building',
] as const
export const Purpose = z.enum(PURPOSES)
export type Purpose = z.infer<typeof Purpose>

/** Blueprint §9 founder stages. Never inferred from age, job title or shelf. */
export const FOUNDER_STAGES = [
  'EXPLORE',
  'VALIDATE',
  'STRUCTURE',
  'SELL',
  'OPERATE_LEAD',
  'SCALE_RENEW',
] as const
export const FounderStage = z.enum(FOUNDER_STAGES)
export type FounderStage = z.infer<typeof FounderStage>

/** Blueprint `CatalogueIntent.status`. PURCHASE_PIPELINE is not availability. */
export const INTENT_STATUSES = [
  'OWNED',
  'READING',
  'COMPLETED',
  'PURCHASE_PIPELINE',
  'DEFERRED',
] as const
export const IntentStatus = z.enum(INTENT_STATUSES)
export type IntentStatus = z.infer<typeof IntentStatus>

/** How the reader could actually get this book. Never a claim about a shop. */
export const ACCESS_ROUTES = ['on-your-shelf', 'public-domain', 'to-obtain'] as const
export const AccessRoute = z.enum(ACCESS_ROUTES)
export type AccessRoute = z.infer<typeof AccessRoute>

/** Blueprint: FULL_READ / SELECTED_CHAPTERS / WORKBOOK_REFERENCE / DEFER. */
export const USAGE = ['FULL_READ', 'SELECTED_CHAPTERS', 'WORKBOOK_REFERENCE', 'DEFER'] as const
export const RecommendedUsage = z.enum(USAGE)
export type RecommendedUsage = z.infer<typeof RecommendedUsage>

/** The documented rejection reasons. The same click means different things. */
export const REJECTION_REASONS = [
  'already-read',
  'wrong-language',
  'unavailable',
  'too-difficult',
  'repetitive',
  'not-relevant',
  'unappealing',
] as const
export const RejectionReason = z.enum(REJECTION_REASONS)
export type RejectionReason = z.infer<typeof RejectionReason>

/* ------------------------------------------------------------------ *
 * Provenance — attached to facts and to inferences, separately
 * ------------------------------------------------------------------ */

export const Provenance = z.object({
  source: z.string().min(1),
  /** ISO date the claim was last confirmed against its source. Null = never. */
  confirmedAt: z.iso.date().nullable(),
  note: z.string().optional(),
})
export type Provenance = z.infer<typeof Provenance>

/* ------------------------------------------------------------------ *
 * 1. Work — the book itself. Facts only.
 * ------------------------------------------------------------------ */

export const Work = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  firstPublished: z.number().int().min(1000).max(2100).nullable(),
  fiction: z.boolean(),
  provenance: Provenance,
})
export type Work = z.infer<typeof Work>

/* ------------------------------------------------------------------ *
 * 2. Edition — one printing, one language. Facts only.
 * ------------------------------------------------------------------ */

export const Edition = z.object({
  id: z.string().min(1),
  workId: z.string().min(1),
  /** BCP-47-ish tag. The language gate reads this and nothing else. */
  language: z.string().min(2),
  isbn13: z.string().regex(/^\d{13}$/).nullable(),
  format: z.enum(['print', 'ebook', 'audio']),
  pages: z.number().int().positive().nullable(),
  provenance: Provenance,
})
export type Edition = z.infer<typeof Edition>

/* ------------------------------------------------------------------ *
 * 3. BookProfile — editorial inference about a Work. Revisable, versioned,
 *    and never mixed into the Work's factual record.
 * ------------------------------------------------------------------ */

export const BookProfile = z.object({
  workId: z.string().min(1),
  modes: z.array(Mode).min(1),
  topics: z.array(z.string().min(1)).default([]),
  /** 1 easy … 5 demanding. */
  conceptualDifficulty: z.number().int().min(1).max(5),
  /** Minutes per sitting this book tolerates well. */
  typicalSessionMinutes: z.number().int().positive(),
  /** 0 none … 5 a concrete practice on the page. Drives Apply, not Enjoy. */
  actionability: z.number().int().min(0).max(5),
  /** 0 calm … 5 heavy. Used to keep Enjoy mode restful, never to infer mood. */
  emotionalIntensity: z.number().int().min(0).max(5),
  /** Founder-branch metadata. Empty arrays mean "not a founder-pathway book". */
  targetStages: z.array(FounderStage).default([]),
  competencyTags: z.array(z.string().min(1)).default([]),
  /** Work ids that should be understood first. */
  prerequisites: z.array(z.string().min(1)).default([]),
  /** Stages at which this book is premature, however good it is. */
  tooEarlyStages: z.array(FounderStage).default([]),
  /** What the reader would produce, in Apply mode. Null = nothing to produce. */
  suggestedArtifact: z.string().nullable().default(null),
  provenance: Provenance,
})
export type BookProfile = z.infer<typeof BookProfile>

/* ------------------------------------------------------------------ *
 * 4. The reader's side
 * ------------------------------------------------------------------ */

export const CatalogueIntent = z.object({
  workId: z.string().min(1),
  status: IntentStatus,
})
export type CatalogueIntent = z.infer<typeof CatalogueIntent>

/** Every field user-confirmed. Nothing here is inferred from behaviour. */
export const FounderContext = z.object({
  stage: FounderStage,
  /** The decision actually in front of them, in their words. Optional. */
  currentDecision: z.string().default(''),
  /** Hours a week available for non-reading action. Caps what Apply can ask. */
  actionHoursPerWeek: z.number().int().min(0).max(60).default(2),
  /** Apply books already open. Feeds the cognitive-load cap. */
  activeApplyBooks: z.number().int().min(0).default(0),
})
export type FounderContext = z.infer<typeof FounderContext>

export const Rejection = z.object({
  workId: z.string().min(1),
  reason: RejectionReason,
})
export type Rejection = z.infer<typeof Rejection>

export const ReadingBrief = z.object({
  purpose: Purpose,
  mode: Mode,
  language: z.string().min(2),
  sessionMinutes: z.number().int().min(5).max(240),
  /** Adult pilot. The gate is explicit rather than assumed. */
  adultConfirmed: z.boolean().default(true),
  /** Asked only when entrepreneurship is the purpose. */
  founderContext: FounderContext.nullable().default(null),
  intents: z.array(CatalogueIntent).default([]),
  rejections: z.array(Rejection).default([]),
  revisitCompleted: z.boolean().default(false),
  /** Topics the reader has explicitly confirmed, not clicks. Worth 10 points. */
  confirmedTopics: z.array(z.string().min(1)).default([]),
})
export type ReadingBrief = z.infer<typeof ReadingBrief>

/* ------------------------------------------------------------------ *
 * 5. The decision
 * ------------------------------------------------------------------ */

/** One named term of the score, with the ceiling it was measured against. */
export const ScoreComponent = z.object({
  signal: z.string().min(1),
  points: z.number(),
  maxPoints: z.number(),
  text: z.string().min(1),
})
export type ScoreComponent = z.infer<typeof ScoreComponent>

export const RESULT_ROLES = ['strongest-fit', 'adjacent-fit', 'exploration'] as const
export const ResultRole = z.enum(RESULT_ROLES)
export type ResultRole = z.infer<typeof ResultRole>

export const RecommendationDecision = z.object({
  rankerVersion: z.string().min(1),
  catalogueVersion: z.string().min(1),
  branch: z.enum(['generic', 'founder']),
  role: ResultRole,
  workId: z.string().min(1),
  editionId: z.string().min(1),
  /** 0–100 after normalisation. A rule total, never a probability of success. */
  score: z.number(),
  components: z.array(ScoreComponent),
  whyThisBook: z.string().min(1),
  whyNow: z.string().min(1),
  whyThisMode: z.string().min(1),
  /** The reading step. Kept separate from the action below, on purpose. */
  firstStep: z.string().min(1),
  /** The non-reading action. Null when the mode does not require one. */
  realWorldAction: z.string().nullable(),
  /** What this book cannot do. Never empty. */
  cannotDo: z.array(z.string().min(1)).min(1),
  accessRoute: AccessRoute,
  recommendedUsage: RecommendedUsage,
  missingPrerequisites: z.array(z.string()),
  deferReason: z.string().nullable(),
})
export type RecommendationDecision = z.infer<typeof RecommendationDecision>
