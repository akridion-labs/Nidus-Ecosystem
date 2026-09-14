import { Work, Edition, BookProfile, CATALOGUE_VERSION } from './contracts.ts'
import type { Work as W, Edition as E, BookProfile as P } from './contracts.ts'

export type RejectedRow = { list: string; index: number; id: unknown; problems: string[] }

/**
 * A Work plus the editions it exists in and the editorial profile attached to
 * it. Assembled, never stored flat, so a profile correction cannot silently
 * rewrite a catalogue fact.
 */
export type CatalogueItem = { work: W; editions: E[]; profile: P }

export type LoadedCatalogue = {
  version: string
  items: CatalogueItem[]
  rejected: RejectedRow[]
  /** Languages some accepted edition really exists in. Drives honest gaps. */
  languages: string[]
}

function parseList<T>(
  list: string,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { path: PropertyKey[]; message: string }[] } } },
  rows: unknown,
  rejected: RejectedRow[],
): T[] {
  if (!Array.isArray(rows)) {
    rejected.push({ list, index: -1, id: null, problems: [`${list} is not an array`] })
    return []
  }
  const out: T[] = []
  rows.forEach((row, index) => {
    const parsed = schema.safeParse(row)
    if (!parsed.success) {
      rejected.push({
        list,
        index,
        id: (row as { id?: unknown; workId?: unknown })?.id ?? (row as { workId?: unknown })?.workId ?? null,
        problems: (parsed.error?.issues ?? []).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      })
      return
    }
    out.push(parsed.data as T)
  })
  return out
}

/**
 * A bad row must never take the catalogue down. Rows are validated one at a
 * time and every failure is collected with the reason, so an operator can see
 * exactly what to fix. Referential problems (an edition with no work, a work
 * with no profile) are rejections too, not silent drops.
 */
export function loadCatalogue(
  workRows: unknown,
  editionRows: unknown,
  profileRows: unknown,
): LoadedCatalogue {
  const rejected: RejectedRow[] = []

  const works = parseList<W>('works', Work, workRows, rejected)
  const editions = parseList<E>('editions', Edition, editionRows, rejected)
  const profiles = parseList<P>('profiles', BookProfile, profileRows, rejected)

  const byWorkId = new Map<string, W>()
  for (const [index, w] of works.entries()) {
    if (byWorkId.has(w.id)) {
      rejected.push({ list: 'works', index, id: w.id, problems: ['duplicate work id'] })
      continue
    }
    byWorkId.set(w.id, w)
  }

  const editionsByWork = new Map<string, E[]>()
  const seenEditionIds = new Set<string>()
  for (const [index, e] of editions.entries()) {
    if (seenEditionIds.has(e.id)) {
      rejected.push({ list: 'editions', index, id: e.id, problems: ['duplicate edition id'] })
      continue
    }
    if (!byWorkId.has(e.workId)) {
      rejected.push({ list: 'editions', index, id: e.id, problems: [`no work "${e.workId}"`] })
      continue
    }
    seenEditionIds.add(e.id)
    const list = editionsByWork.get(e.workId) ?? []
    list.push(e)
    editionsByWork.set(e.workId, list)
  }

  const profileByWork = new Map<string, P>()
  for (const [index, p] of profiles.entries()) {
    if (!byWorkId.has(p.workId)) {
      rejected.push({ list: 'profiles', index, id: p.workId, problems: [`no work "${p.workId}"`] })
      continue
    }
    if (profileByWork.has(p.workId)) {
      rejected.push({ list: 'profiles', index, id: p.workId, problems: ['duplicate profile for this work'] })
      continue
    }
    profileByWork.set(p.workId, p)
  }

  const items: CatalogueItem[] = []
  for (const work of byWorkId.values()) {
    const workEditions = editionsByWork.get(work.id) ?? []
    const profile = profileByWork.get(work.id)
    if (workEditions.length === 0) {
      rejected.push({ list: 'works', index: -1, id: work.id, problems: ['no valid edition'] })
      continue
    }
    if (!profile) {
      rejected.push({ list: 'works', index: -1, id: work.id, problems: ['no editorial profile'] })
      continue
    }
    items.push({ work, editions: workEditions, profile })
  }

  const languages = [...new Set(items.flatMap((i) => i.editions.map((e) => e.language)))].sort()
  return { version: CATALOGUE_VERSION, items, rejected, languages }
}

/** The edition to offer for a language, or undefined when there is no gap-free answer. */
export function editionIn(item: CatalogueItem, language: string): E | undefined {
  return item.editions.find((e) => e.language === language)
}

export function isUnverified(item: CatalogueItem): boolean {
  return item.work.provenance.confirmedAt === null
}
