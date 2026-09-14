/**
 * Feedback to proposal. Deterministic, and it proposes only — the reader
 * decides. Each rule reflects the adaptation table in the research report:
 * the same word means different things, so each kind gets its own response.
 */
export type Goal = { daysPerWeek: number; sessionMinutes: number }

export type Proposal = {
  reason: string
  before: Goal & { action: string }
  after: Goal & { action: string }
}

export function proposeFor(kind: string, goal: Goal): Proposal | null {
  const before = { ...goal, action: 'keep the current plan' }

  switch (kind) {
    case 'too-busy':
      // Shorten, never add catch-up debt.
      return {
        reason: 'You said the week was too busy. Nothing is owed and nothing is lost.',
        before,
        after: {
          daysPerWeek: Math.max(1, goal.daysPerWeek - 1),
          sessionMinutes: Math.max(5, Math.round(goal.sessionMinutes / 2)),
          action: 'shorter sessions, one fewer day, no catch-up',
        },
      }
    case 'too-difficult':
      return {
        reason: 'You said it was too difficult. That is usually the book or the order, not you.',
        before,
        after: { ...goal, action: 'switch to an easier title or read selected chapters' },
      }
    case 'boring':
      // Boring is ambiguous: ask rather than assume repetition or bad timing.
      return {
        reason: 'You said it was boring. That can mean repetition, wrong timing or a changed taste, so this asks rather than guesses.',
        before,
        after: { ...goal, action: 'confirm which it was, then change title, mode or session size' },
      }
    case 'not-relevant':
      return {
        reason: 'You said it was not relevant. The goal is reconfirmed before anything is re-ranked.',
        before,
        after: { ...goal, action: 'reconfirm your purpose before new suggestions' },
      }
    case 'did-not-stick':
      return {
        reason: 'You said it did not stick. One simpler explanation and one application example.',
        before,
        after: { ...goal, action: 'revisit one idea with a worked example' },
      }
    case 'useful':
      return null // Nothing to fix. Do not manufacture a change.
    default:
      return null
  }
}
