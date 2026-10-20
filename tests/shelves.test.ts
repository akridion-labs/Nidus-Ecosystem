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

test('the science-fiction shelf says what is really on it', () => {
  // This test used to assert the shelf was EMPTY, and that was the right
  // assertion for as long as it was true: the shelf showed a deliberate zero
  // for weeks rather than being padded with the nearest adjacent book. Books
  // arrived on 20 October 2026, so the assertion that outlives both states is
  // the one the reader depends on — the count on screen is the real count, and
  // anything on this shelf is really tagged science fiction.
  const shelf = SHELVES.find((s) => s.id === 'sci-fi')!
  const on = shelfItems(loaded, shelf)
  for (const item of on) {
    assert.ok(
      item.profile.topics.some((t) => shelf.topics.includes(t)),
      `${item.work.id} is on the science-fiction shelf without a matching topic`,
    )
  }
  // The shelf note stopped saying "genuinely not here yet" when that stopped
  // being true. If the shelf ever empties again, the note must go back.
  if (on.length === 0) {
    assert.match(shelf.note, /not here yet/,
      'an empty shelf must say so; the note promises content that does not exist')
  } else {
    assert.doesNotMatch(shelf.note, /not here yet/,
      'the shelf has books and the note still claims it is empty')
  }
})

test('every book in the catalogue reaches at least one shelf', () => {
  // Otherwise a book exists that no amount of browsing can ever surface.
  for (const item of loaded.items) {
    const found = SHELVES.some((s) => shelfItems(loaded, s).some((i) => i.work.id === item.work.id))
    assert.ok(found, `${item.work.id} is on no shelf at all`)
  }
})
