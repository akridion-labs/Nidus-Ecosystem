import { CatalogueEdition } from './contracts.ts'
import type { CatalogueEdition as Edition } from './contracts.ts'

export type RejectedRow = { index: number; id: unknown; problems: string[] }

export type LoadedCatalogue = {
  editions: Edition[]
  rejected: RejectedRow[]
  /** Languages any accepted edition actually exists in. Drives honest gap messages. */
  languages: string[]
}

/**
 * A bad row must never take the catalogue down. Every row is validated on its
 * own; failures are collected so an operator can see exactly what to fix.
 */
export function loadCatalogue(rows: unknown): LoadedCatalogue {
  if (!Array.isArray(rows)) {
    return { editions: [], rejected: [{ index: -1, id: null, problems: ['catalogue is not an array'] }], languages: [] }
  }

  const editions: Edition[] = []
  const rejected: RejectedRow[] = []
  const seenIds = new Set<string>()

  rows.forEach((row, index) => {
    const parsed = CatalogueEdition.safeParse(row)
    if (!parsed.success) {
      rejected.push({
        index,
        id: (row as { id?: unknown })?.id ?? null,
        problems: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      })
      return
    }
    if (seenIds.has(parsed.data.id)) {
      rejected.push({ index, id: parsed.data.id, problems: ['duplicate id'] })
      return
    }
    seenIds.add(parsed.data.id)
    editions.push(parsed.data)
  })

  const languages = [...new Set(editions.flatMap((e) => e.languages))].sort()
  return { editions, rejected, languages }
}

/** True when nothing in the catalogue has been confirmed against a source. */
export function isUnverified(edition: Edition): boolean {
  return edition.provenance.confirmedAt === null
}
