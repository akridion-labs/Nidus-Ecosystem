import type { Mode, Purpose } from './contracts.ts'
import type { CatalogueItem, LoadedCatalogue } from './catalogue.ts'

/* ---------------------------------------------------------------- *
 * The shelves — a catalogue you can wander, not a form you fill in.
 *
 * Shelves are defined by TOPICS, and membership is computed from the editorial
 * profiles the ranker already uses. Nothing is hand-assigned, so a shelf can
 * never claim a book the catalogue does not actually place there, and a shelf
 * with nothing in it comes out empty on its own rather than being quietly
 * dropped. The science-fiction shelf is the test of that, and it fails
 * honestly: this catalogue contains no science fiction at all.
 *
 * Browsing is deliberately NOT a recommendation. A shelf shows what exists; the
 * ranker still decides what fits tonight, and may well not pick the book you
 * were looking at. Blurring those two would cost the product the only thing it
 * has: the arithmetic meaning something.
 * ---------------------------------------------------------------- */
export type Shelf = {
  id: string
  name: string
  note: string
  topics: string[]
  /** The brief this shelf stands for, if the reader wants tonight's pick from it. */
  brief: { purpose: Purpose; mode: Mode; sessionMinutes: number }
}

export const SHELVES: Shelf[] = [
  {
    id: 'build-calmly',
    name: 'Build, without being pulled apart',
    note: 'For the evening you want to move the company forward and still put the phone down afterwards.',
    topics: ['company-building', 'validation', 'customer-research', 'experiments', 'management', 'crisis'],
    brief: { purpose: 'company-building', mode: 'apply', sessionMinutes: 20 },
  },
  {
    id: 'think-clearly',
    name: 'Think more clearly',
    note: 'Judgement, strategy, and the particular calm of having decided something.',
    topics: ['decision', 'judgement', 'bias', 'strategy', 'composure', 'moral-choice'],
    brief: { purpose: 'decision', mode: 'explore', sessionMinutes: 20 },
  },
  {
    id: 'hold-attention',
    name: 'Get your attention back',
    note: 'For when the work is fine and the focus is gone.',
    topics: ['focus', 'attention', 'craft', 'discipline'],
    brief: { purpose: 'craft', mode: 'apply', sessionMinutes: 30 },
  },
  {
    id: 'elsewhere',
    name: 'Somewhere else for an hour',
    note: 'Nothing to apply, nothing to produce. A place to be instead of here.',
    topics: ['journey', 'travel', 'solitude', 'short-stories', 'everyday-life', 'india', 'persistence'],
    brief: { purpose: 'unwind', mode: 'enjoy', sessionMinutes: 20 },
  },
  {
    id: 'what-for',
    name: 'What it is all for',
    note: 'The question that turns up at 1am when the launch is done.',
    topics: ['meaning', 'endurance', 'duty', 'history'],
    brief: { purpose: 'curiosity', mode: 'explore', sessionMinutes: 20 },
  },
  {
    id: 'money',
    // Added because tests/shelves.test.ts found a book no amount of browsing
    // could reach. An unreachable book is a catalogue bug, not a taste call.
    name: 'Money, and how people think about it',
    note: 'One book here is widely argued with. It is shelved as a reading hypothesis, not as advice.',
    topics: ['money', 'mindset'],
    brief: { purpose: 'curiosity', mode: 'explore', sessionMinutes: 10 },
  },
  {
    id: 'sci-fi',
    name: 'Science fiction',
    note: 'Asked for, and genuinely not here yet.',
    topics: ['science-fiction', 'space', 'future', 'speculative'],
    brief: { purpose: 'curiosity', mode: 'enjoy', sessionMinutes: 20 },
  },
]

/**
 * Membership is computed, never hand-listed. A topic typo therefore empties a
 * shelf rather than silently mislabelling one, and tests/shelves.test.ts is
 * what notices.
 */
export function shelfItems(catalogue: LoadedCatalogue, shelf: Shelf): CatalogueItem[] {
  return catalogue.items.filter((i) => i.profile.topics.some((t) => shelf.topics.includes(t)))
}
