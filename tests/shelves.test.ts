import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadCatalogue } from '../src/domain/catalogue.ts'
import { seedWorks, seedEditions, seedProfiles } from '../src/data/catalogue.seed.ts'
import { SHELVES, shelfItems } from '../src/domain/shelves.ts'

const loaded = loadCatalogue(seedWorks, seedEditions, seedProfiles)

test('a shelf only ever contains books the catalogue actually places there', () => {
  // The failure this guards against is a shelf that looks curated but is not:
  // membership must come from the same editorial topics the ranker reads.
  for (const shelf of SHELVES) {
    for (const item of shelfItems(loaded, shelf)) {
      assert.ok(
        item.profile.topics.some((t) => shelf.topics.includes(t)),
        `${item.work.id} is on "${shelf.name}" without sharing a topic with it`,
      )
    }
  }
})

test('every shelf that claims to have books has books', () => {
  // A typo in a topic string empties a shelf silently. Science fiction is
  // empty on purpose and is the one exception, which is asserted below so the
  // exception cannot quietly spread to the others.
  for (const shelf of SHELVES.filter((s) => s.id !== 'sci-fi')) {
    assert.ok(shelfItems(loaded, shelf).length > 0, `shelf "${shelf.name}" is empty`)
  }
})

test('the science-fiction shelf is genuinely empty, not decoratively empty', () => {
  const shelf = SHELVES.find((s) => s.id === 'sci-fi')!
  assert.equal(shelfItems(loaded, shelf).length, 0)
  // And the claim the UI makes about it — no science fiction anywhere in the
  // catalogue — is true of every book, not just of this shelf's topic list.
  for (const item of loaded.items) {
    assert.equal(item.work.fiction && item.profile.topics.includes('science-fiction'), false)
  }
})

test('every book in the catalogue reaches at least one shelf', () => {
  // Otherwise a book exists that no amount of browsing can ever surface.
  for (const item of loaded.items) {
    const found = SHELVES.some((s) => shelfItems(loaded, s).some((i) => i.work.id === item.work.id))
    assert.ok(found, `${item.work.id} is on no shelf at all`)
  }
})
