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
 * Where a reader could look for a copy, fastest route first.
 *
 * Two rules, and the second one is the hard one.
 *
 * 1. Every route is a SEARCH or a MAP, never a listing. Nidus has no price
 *    feed, no stock feed and no delivery feed. A link to a search stays true
 *    forever; a link to a price is wrong the first time the price changes.
 *
 * 2. `speed` is about the ROUTE, not about this order. "Today, if they have
 *    it" is true of every bookshop in the world and claims nothing about any
 *    particular shop on any particular day. "Arrives Tuesday" would be a claim
 *    about one order, which is the thing Nidus cannot make. The conditional in
 *    that sentence is not hedging — it is the entire difference between a fact
 *    and a guess, and it is why the fastest routes are listed first without
 *    anyone being promised anything.
 *
 * The map link is how "give me directions and the shop's number" gets answered
 * honestly: Nidus does not hold a phone number that might be three years out
 * of date, the map holds a current one, and the reader gets directions in the
 * same tap.
 *
 * No affiliate tags, no commission, and the order is by typical speed rather
 * than by who would pay to be first.
 */
export type RouteSpeed = 'now' | 'same-day' | 'days'

export type Route = {
  label: string
  url: string
  note: string
  speed: RouteSpeed
}

export const SPEED_COPY: Record<RouteSpeed, string> = {
  now: 'Now',
  'same-day': 'Today, if they have it',
  days: 'Usually a few days',
}

export function findRoutes(item: CatalogueItem, publicDomain: boolean): Route[] {
  const q = encodeURIComponent(`${item.work.title} ${item.work.author}`)
  const routes: Route[] = []

  if (publicDomain) {
    routes.push({
      label: 'Read it free, legally',
      url: `https://www.gutenberg.org/ebooks/search/?query=${q}`,
      note: 'Out of copyright. The translation you pick changes the reading, so choose deliberately.',
      speed: 'now',
    })
  }

  routes.push(
    {
      label: 'A library near you',
      url: `https://search.worldcat.org/search?q=${q}`,
      note: 'Usually the cheapest route, and the one people forget.',
      speed: 'same-day',
    },
    {
      label: 'A bookshop near you — map and directions',
      url: 'https://www.google.com/maps/search/?api=1&query=bookshop+near+me',
      note: 'Opens a map with directions and each shop\u2019s own listed number. Nidus does not store phone numbers that go out of date, and it still cannot see anyone\u2019s shelves — ringing ahead is the fastest way to know.',
      speed: 'same-day',
    },
    {
      label: 'Second-hand',
      url: `https://duckduckgo.com/?q=${q}+second+hand+book+india`,
      note: 'India has a real used-book market — BookChor, Clankart, Bookflow and others. Often a third of the price, and the book is the same book.',
      speed: 'days',
    },
    {
      label: 'New, online',
      url: `https://www.amazon.in/s?k=${q}`,
      note: 'A search, not a listing. Nidus does not know the price or whether it is in stock.',
      speed: 'days',
    },
  )
  return routes
}
