import { z } from 'zod'

/**
 * P01 contracts. Catalogue FACTS (title, author, edition, language) are kept
 * separate from editorial INFERENCES (modes, difficulty, founderStages) so a
 * later provenance review can replace one without touching the other.
 */

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

export const FOUNDER_STAGES = ['none', 'idea', 'first-customers', 'scaling'] as const
export const FounderStage = z.enum(FOUNDER_STAGES)
export type FounderStage = z.infer<typeof FounderStage>

/** Access is a claim about the reader's copy, never a claim about a shop. */
export const ACCESS = ['owned', 'planned', 'library', 'unverified'] as const
export const Access = z.enum(ACCESS)
export type Access = z.infer<typeof Access>

/** Where a row's facts came from. No row is treated as verified by default. */
export const Provenance = z.object({
  source: z.string().min(1),
  /** ISO date the facts were last confirmed against the source. Null = never. */
  confirmedAt: z.iso.date().nullable(),
  note: z.string().optional(),
})
export type Provenance = z.infer<typeof Provenance>

export const CatalogueEdition = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  /** BCP-47-ish tags this edition actually exists in. Drives the language gate. */
  languages: z.array(z.string().min(2)).min(1),
  isbn13: z.string().regex(/^\d{13}$/).nullable(),
  firstPublished: z.number().int().min(1000).max(2100).nullable(),
  pages: z.number().int().positive().nullable(),
  fiction: z.boolean(),
  /** Editorial inference, revisable. */
  modes: z.array(Mode).min(1),
  difficulty: z.number().int().min(1).max(5),
  /** Minutes per sitting this book tolerates well. Editorial inference. */
  minSessionMinutes: z.number().int().positive(),
  topics: z.array(z.string().min(1)).default([]),
  /** Founder stages this helps. Empty = not a founder-pathway book. */
  founderStages: z.array(FounderStage).default([]),
  provenance: Provenance,
})
export type CatalogueEdition = z.infer<typeof CatalogueEdition>

export const ReadingBrief = z.object({
  purpose: Purpose,
  mode: Mode,
  language: z.string().min(2),
  sessionMinutes: z.number().int().min(5).max(240),
  founderStage: FounderStage.default('none'),
  /** Titles the reader has finished. Excluded unless revisit is asked for. */
  completedIds: z.array(z.string()).default([]),
  revisitCompleted: z.boolean().default(false),
  /** Ids the reader rejected in this session, with their stated reason. */
  rejectedIds: z.array(z.string()).default([]),
  access: z.array(Access).default([...ACCESS]),
})
export type ReadingBrief = z.infer<typeof ReadingBrief>

/** One traceable reason a book scored what it scored. */
export const ScoreReason = z.object({
  signal: z.string().min(1),
  points: z.number(),
  text: z.string().min(1),
})
export type ScoreReason = z.infer<typeof ScoreReason>

export const RecommendationDecision = z.object({
  rankerVersion: z.string().min(1),
  editionId: z.string().min(1),
  score: z.number(),
  reasons: z.array(ScoreReason),
  whyNow: z.string().min(1),
  limitations: z.array(z.string()),
})
export type RecommendationDecision = z.infer<typeof RecommendationDecision>
