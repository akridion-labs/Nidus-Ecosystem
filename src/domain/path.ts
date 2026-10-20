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
  //
  // `seen` is carried through from the walk above, so a book that was already
  // listed as a prerequisite cannot reappear here as an unlock. Without that,
  // a cycle in the data produced "read B, then A, then B" - a reader told to
  // read the same book twice, on either side of the one they asked about. The
  // walk was already safe from hanging; the OUTPUT was not safe from
  // repeating, and a repeated step looks like an answer rather than a fault.
  for (const item of catalogue.items) {
    if (!item.profile.prerequisites.includes(workId)) continue
    if (seen.has(item.work.id)) continue
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

/**
 * Cheapest first, for a reader who said price matters more than speed.
 *
 * The order is editorial and stated rather than computed, because Nidus has no
 * price feed and will not pretend to: this is the order these routes USUALLY
 * come in, not a claim about any particular book. Free and legal beats a
 * library card beats a used copy beats a new one. That holds without knowing a
 * single price, which is exactly why it is safe to show.
 */
const COST_ORDER: Record<string, number> = {
  'Read it free, legally': 0,
  'A library near you': 1,
  'Second-hand': 2,
  'A bookshop near you — map and directions': 3,
  'New, online': 4,
}

export function findRoutes(
  item: CatalogueItem,
  publicDomain: boolean,
  order: 'speed' | 'cost' = 'speed',
): Route[] {
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
  if (order === 'cost') {
    routes.sort((a, b) => (COST_ORDER[a.label] ?? 99) - (COST_ORDER[b.label] ?? 99))
  }
  return routes
}

/* ------------------------------------------------------------------ *
 * Where to buy it: the shops, named, in one compact row.
 * ------------------------------------------------------------------ */

export type Retailer = {
  /** The shop's own name. Used as the visible label and the accessible name. */
  name: string
  /** Builds a SEARCH url. Never a product url. See the comment below. */
  search: (query: string) => string
  /** One line, shown when the reader hovers or focuses the chip. */
  note: string
  kind: 'new' | 'used'
}

/**
 * EVERY URL HERE IS A SEARCH, NEVER A PRODUCT PAGE.
 *
 * The request was: do not send someone to Amazon if the book is not on Amazon.
 * That is exactly right, and a search url is how it is kept, because Nidus has
 * no way to know whether a given shop stocks a given title:
 *
 *   - a product url needs an identifier Nidus does not have for any shop, and
 *     a guessed one is a 404 with our name on it;
 *   - a search url cannot go stale and cannot lie. If the shop does not have
 *     the book, the reader sees the SHOP say so, which is the shop's own fact
 *     rather than our guess about it.
 *
 * There are no affiliate tags on any of these, and Nidus takes no commission
 * (DR-005). If that ever changes it must be disclosed on the card itself.
 *
 * Names, not logos: a shop's logo is its trademark and not ours to redraw, and
 * a hand-drawn approximation of someone's brand mark is worse than their name
 * set in our own type. The name is also what a reader reads faster.
 */
export const RETAILERS: Retailer[] = [
  {
    name: 'Amazon',
    search: (q) => `https://www.amazon.in/s?k=${q}&i=stripbooks`,
    note: 'Widest range and usually fastest delivery. Nidus cannot see the price or whether it is in stock.',
    kind: 'new',
  },
  {
    name: 'Flipkart',
    search: (q) => `https://www.flipkart.com/search?q=${q}`,
    note: 'Often cheaper than Amazon on Indian editions, and often not. Worth the second tab.',
    kind: 'new',
  },
  {
    name: 'Crossword',
    search: (q) => `https://www.crossword.in/search?q=${q}`,
    note: 'An actual chain of shops. If a branch is near you, the book can be in your hand today rather than Thursday.',
    kind: 'new',
  },
  {
    name: 'Bookswagon',
    search: (q) => `https://www.bookswagon.com/search-books/${q}`,
    note: 'Indian bookseller with deep backlist — carries things the big two quietly do not.',
    kind: 'new',
  },
  {
    name: 'BookChor',
    search: (q) => `https://www.bookchor.com/search?q=${q}`,
    note: 'Second-hand, and the same words on the same pages. Often a third of the price.',
    kind: 'used',
  },
  {
    name: 'Clankart',
    search: (q) => `https://www.clankart.com/search?q=${q}`,
    note: 'Used books sold between people, city by city. Condition varies; the price reflects it.',
    kind: 'used',
  },
]

/** The shops to show for a book, with the query already built in. */
export function retailerLinks(item: CatalogueItem): (Retailer & { url: string })[] {
  const q = encodeURIComponent(`${item.work.title} ${item.work.author}`)
  return RETAILERS.map((r) => ({ ...r, url: r.search(q) }))
}
