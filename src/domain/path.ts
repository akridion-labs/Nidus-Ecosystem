import type { CatalogueItem, LoadedCatalogue } from './catalogue.ts'
import type { ReadingBrief } from './contracts.ts'

/**
 * A reading path — step 1, step 2 — computed from the catalogue's own
 * prerequisite graph rather than written by hand.
 *
 * The honest shape of this is NOT a curriculum. It is: what this book assumes
 * you have read, the book itself, and what it opens. Three stretches of a
 * chain, no more. A recommender that hands a founder a twelve-step programme
 * is selling the idea that entrepreneurship is a syllabus, which is the thing
 * this catalogue's own notes keep warning about.
 *
 * `status` is the whole point of the ordering:
 *   done   — already finished, so it is context rather than homework
 *   now    — the book being looked at
 *   next   — reachable: prerequisites met and no stage gate in the way
 *   later  — the reading is done but the SITUATION has not happened yet
 */
export type StepStatus = 'done' | 'now' | 'next' | 'later'

export type Step = {
  item: CatalogueItem
  status: StepStatus
  why: string
}

const STAGE_WORD: Record<string, string> = {
  EXPLORE: 'exploring', VALIDATE: 'validating', STRUCTURE: 'structuring',
  SELL: 'selling', OPERATE_LEAD: 'operating and leading', SCALE_RENEW: 'scaling and renewing',
}

export function readingPath(
  catalogue: LoadedCatalogue,
  workId: string,
  brief: ReadingBrief,
): Step[] {
  const byId = new Map(catalogue.items.map((i) => [i.work.id, i]))
  const target = byId.get(workId)
  if (!target) return []

  const finished = new Set(
    brief.intents.filter((i) => i.status === 'COMPLETED').map((i) => i.workId),
  )
  const stage = brief.founderContext?.stage ?? null

  // Everything this book assumes, deepest first — the order you would read it.
  const before: CatalogueItem[] = []
  const seen = new Set<string>([workId])
  const walk = (id: string) => {
    const item = byId.get(id)
    if (!item || seen.has(id)) return
    seen.add(id)
    for (const p of item.profile.prerequisites) walk(p)
    before.push(item)
  }
  for (const p of target.profile.prerequisites) walk(p)

  const steps: Step[] = before.map((item) => ({
    item,
    status: finished.has(item.work.id) ? 'done' : 'next',
    why: finished.has(item.work.id)
      ? 'Already read, which is why the next one is open to you.'
      : `${target.work.title} assumes this one. Read it first or the next book will keep referring to something you have not seen.`,
  }))

  steps.push({
    item: target,
    status: 'now',
    why: target.profile.suggestedArtifact
      ? `What it asks of you: ${target.profile.suggestedArtifact.toLowerCase()}.`
      : 'Nothing to produce. Read it and let it argue with you.',
  })

  // What this book opens, once it is finished.
  for (const item of catalogue.items) {
    if (!item.profile.prerequisites.includes(workId)) continue
    if (finished.has(item.work.id)) continue
    const tooEarly = stage !== null && item.profile.tooEarlyStages.includes(stage)
    const otherGaps = item.profile.prerequisites.filter(
      (p) => p !== workId && !finished.has(p),
    )
    steps.push({
      item,
      status: tooEarly ? 'later' : 'next',
      why: tooEarly
        ? `The reading will be done. The situation has not happened — this is premature while ${STAGE_WORD[stage!] ?? 'you are here'}.`
        : otherGaps.length > 0
          ? `Also assumes ${otherGaps.map((g) => byId.get(g)?.work.title ?? g).join(' and ')}.`
          : 'Opens as soon as you finish the one above.',
    })
  }

  return steps
}

/**
 * Where a reader could look for a copy.
 *
 * Every one of these is a SEARCH, never a listing, and that distinction is the
 * whole design. Nidus has no price feed, no stock feed and no delivery feed,
 * so it cannot say what a book costs, whether anyone has it, or when it would
 * arrive — and a link to a search result stays true forever, where a link to a
 * price goes wrong the first time the price changes.
 *
 * No affiliate tags, no commission, and no ordering that favours one shop.
 */
export type Route = { label: string; url: string; note: string }

export function findRoutes(item: CatalogueItem, publicDomain: boolean): Route[] {
  const q = encodeURIComponent(`${item.work.title} ${item.work.author}`)
  const routes: Route[] = []

  if (publicDomain) {
    routes.push({
      label: 'Read it free, legally',
      url: `https://www.gutenberg.org/ebooks/search/?query=${q}`,
      note: 'Out of copyright. The translation you pick changes the reading, so choose deliberately.',
    })
  }

  routes.push(
    {
      label: 'Search online sellers',
      url: `https://www.amazon.in/s?k=${q}`,
      note: 'A search, not a listing. Nidus does not know the price or whether it is in stock.',
    },
    {
      label: 'Find a bookshop near you',
      url: `https://duckduckgo.com/?q=${q}+bookshop+near+me`,
      note: 'Nidus cannot see any shop’s shelves. Ringing one is still the fastest way to know.',
    },
    {
      label: 'Find it in a library',
      url: `https://search.worldcat.org/search?q=${q}`,
      note: 'Often the cheapest route, and the one people forget.',
    },
  )
  return routes
}
