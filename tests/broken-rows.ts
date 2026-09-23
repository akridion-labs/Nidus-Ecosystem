/**
 * Rows that MUST fail validation. Kept out of src/ so they cannot ship: when
 * they lived in the seed, the app's own honesty footer reported them to every
 * visitor as "4 catalogue rows failed validation".
 *
 * Each row breaks exactly one rule, so a test can name the reason it expects.
 */
const DRAFT = { source: 'manual-draft', confirmedAt: null }
const EDITORIAL = { source: 'editorial-draft', confirmedAt: null }

export const brokenWorks: unknown[] = [
  // Fixture: must be rejected (no title).
  { id: 'broken-work', title: '', author: 'Fixture', firstPublished: null, fiction: false, provenance: DRAFT }
]

export const brokenEditions: unknown[] = [
  // Fixture: must be rejected (language too short).
  { id: 'broken-edition', workId: 'lean-startup', language: '', isbn13: null, format: 'print', pages: null, provenance: DRAFT },
  // Fixture: must be rejected (points at a work that does not exist).
  { id: 'orphan-edition', workId: 'no-such-work', language: 'en', isbn13: null, format: 'print', pages: null, provenance: DRAFT }
]

export const brokenProfiles: unknown[] = [
  // Fixture: must be rejected (difficulty out of range).
  {
    workId: 'siddhartha', inOneLine: 'Fixture row.', modes: ['enjoy'], topics: [], conceptualDifficulty: 9, typicalSessionMinutes: 10,
    actionability: 0, emotionalIntensity: 0, targetStages: [], competencyTags: [], prerequisites: [],
    tooEarlyStages: [], suggestedArtifact: null, provenance: EDITORIAL,
  }
]
