import { z } from 'zod'

/** Validation at the boundary. Nothing reaches the repository unparsed. */

export const CONSENT_VERSION = 'nidus-consent-2026-09-1'
export const RETENTION_DAYS = 30

/** Exactly what is disclosed before anything is stored. */
export const DISCLOSED_FIELDS = [
  'a pseudonymous identifier in a cookie on this device',
  'your chosen timezone',
  'the purpose, mode, language and session length you selected',
  'the book you chose and the ranker and catalogue versions that suggested it',
  'your reading check-ins, which are self-reported',
  'the feedback you write, including negative feedback',
] as const

export const ConsentRequest = z.object({
  timezone: z.string().min(1).max(64),
  researchConsent: z.literal(true),
  contactConsent: z.boolean().default(false),
})

export const JourneyRequest = z.object({
  workId: z.string().min(1).max(128),
  editionId: z.string().min(1).max(128),
  mode: z.enum(['enjoy', 'explore', 'apply']),
  purpose: z.string().min(1).max(64),
  language: z.string().min(2).max(16),
  rankerVersion: z.string().min(1).max(64),
  catalogueVersion: z.string().min(1).max(64),
})

export const GoalRequest = z.object({
  daysPerWeek: z.number().int().min(1).max(5),
  sessionMinutes: z.number().int().min(5).max(240),
  effectiveFrom: z.iso.date().optional(),
})

export const CheckInRequest = z.object({
  minutes: z.number().int().min(1).max(600),
  journeyId: z.uuid().nullable().optional(),
})

export const FeedbackRequest = z.object({
  kind: z.enum(['useful', 'boring', 'too-busy', 'too-difficult', 'not-relevant', 'did-not-stick']),
  note: z.string().max(2000).default(''),
  journeyId: z.uuid().nullable().optional(),
})

export const AdaptationDecision = z.object({ accept: z.boolean() })
export const AdaptationOutcome = z.object({ helped: z.boolean() })
