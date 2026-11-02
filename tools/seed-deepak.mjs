/**
 * Create Deepak's reader profile: the admin role, and the real shelf.
 *
 *   DATABASE_URL=postgres://... node tools/seed-deepak.mjs
 *   DATABASE_URL=postgres://... node tools/seed-deepak.mjs --rotate
 *
 * WHY A SCRIPT AND NOT A SIGN-UP PAGE
 *
 * DR-009: the master login is a role on an ordinary account, never a separate
 * door. So there is no "admin sign-up", no bootstrap password and no first-run
 * screen that grants privileges to whoever reaches it first. Admin is granted
 * by someone holding the database, which is the one credential that cannot be
 * phished from the outside.
 *
 * WHAT IT PRINTS
 *
 * One credential, once. It is the SAME opaque credential the rest of the API
 * already uses — this script issues one rather than inventing a second auth
 * path, so there is no new way in to get wrong. Only its SHA-256 is stored, so
 * nobody including this script can recover it later; `--rotate` issues a fresh
 * one and invalidates the old.
 *
 * Running it twice without --rotate updates the shelf and leaves the existing
 * credential working, so it is safe to re-run when the shelf changes.
 */

import { seedWorks } from '../src/data/catalogue.seed.ts'
import { connect } from '../server/db/client.ts'
import * as repo from '../server/db/repo.ts'
import { CONSENT_VERSION, DISCLOSED_FIELDS } from '../server/http/contracts.ts'

const GOOGLE_SUB = 'local-admin:deepak'
const DISPLAY_NAME = 'Deepak'

/**
 * The shelf as recorded in Deepak_Founder_Reading_Catalogue_v1.md, using
 * catalogue work ids. Books on the physical shelf that Nidus does not stock
 * are left out rather than invented — the shelf map counts thirty-three
 * spines and the catalogue holds the ones below.
 */
const COMPLETED = ['rich-dad', 'lean-startup']
const READING = ['hundred-dollar-startup']
const OWNED = [
  // money
  'cashflow-quadrant', 'guide-to-investing', 'psychology-of-money', 'black-swan', 'money-trap',
  // management and team
  'five-dysfunctions', 'radical-candor', 'no-rules-rules', 'hard-thing', 'be-2-0',
  // strategy, selling, systems
  'zero-to-one', 'five-rings', 'win-friends', 'art-of-persuasion', 'e-myth',
  'innovators-dilemma', 'innovators-solution',
  // mindset — eleven of them, which is the finding, not the goal
  'awaken-giant', 'think-grow-rich', 'grit', 'mindset', 'think-like-monk',
  'art-of-impossible', 'do-hard-things', 'courage-disliked', 'meditations',
  'counsels-maxims', 'bhagavad-gita',
  // fiction and focus
  'fountainhead', 'deep-work',
  // owned, arrived 19 October, not yet started
  'mom-test',
]
/** Decided and dated in the November plan. Pipeline is not ownership. */
const PURCHASE_PIPELINE = ['quiet', 'mastery-greene', 'obviously-awesome']
const DEFERRED = ['good-to-great']

/**
 * A work id that does not exist in the catalogue would seed a shelf entry the
 * ranker silently ignores, which looks exactly like a shelf that works. Fail
 * here instead, before touching the database.
 */
const known = new Set(seedWorks.map((w) => w.id))
const unknown = [...COMPLETED, ...READING, ...OWNED, ...PURCHASE_PIPELINE, ...DEFERRED]
  .filter((id) => !known.has(id))
if (unknown.length > 0) {
  console.error(`\nNot in the catalogue: ${unknown.join(', ')}`)
  console.error('Add them to src/data/catalogue.seed.ts or remove them here. Nothing was written.\n')
  process.exit(1)
}

const rotate = process.argv.includes('--rotate')
const sql = connect()

try {
  const [existing] = await sql`SELECT id, role FROM readers WHERE google_sub = ${GOOGLE_SUB}`
  let readerId = existing?.id
  let credential = null

  if (!existing) {
    credential = repo.newCredential()
    readerId = await repo.createReaderWithConsent(sql, {
      credential, timezone: 'Asia/Kolkata',
      consentVersion: CONSENT_VERSION, disclosedFields: DISCLOSED_FIELDS,
      // The founder consents to his own research pilot. Contact consent stays
      // false: there is no email column written anywhere in this script.
      // Deliberately not RETENTION_DAYS (30). That default exists so a
      // stranger's row does not sit around unused; this is the founder's own
      // long-lived account and expiring it mid-pilot would delete the shelf
      // the ranker depends on. The row is still deletable by the same route
      // as anyone else's.
      researchConsent: true, contactConsent: false, retentionDays: 3650,
    })
    await sql`UPDATE readers SET google_sub = ${GOOGLE_SUB}, display_name = ${DISPLAY_NAME}
              WHERE id = ${readerId}`
  } else if (rotate) {
    credential = repo.newCredential()
    await sql`UPDATE readers SET credential_hash = ${repo.hashCredential(credential)}
              WHERE id = ${readerId}`
  }

  await repo.setRole(sql, readerId, 'admin')

  const intents = [
    ...COMPLETED.map((workId) => ({ workId, status: 'COMPLETED' })),
    ...READING.map((workId) => ({ workId, status: 'READING' })),
    ...OWNED.map((workId) => ({ workId, status: 'OWNED' })),
    ...PURCHASE_PIPELINE.map((workId) => ({ workId, status: 'PURCHASE_PIPELINE' })),
    ...DEFERRED.map((workId) => ({ workId, status: 'DEFERRED' })),
  ]
  const saved = await repo.setIntents(sql, readerId, intents)

  console.log(`\nreader   ${readerId}  (${DISPLAY_NAME}, role admin)`)
  console.log(`shelf    ${saved} books — ${COMPLETED.length} completed, ${READING.length} reading, ` +
              `${OWNED.length} owned, ${PURCHASE_PIPELINE.length} to buy, ${DEFERRED.length} deferred`)

  if (credential) {
    console.log(`\nYour credential, shown once and never recoverable:\n\n  ${credential}\n`)
    console.log('To sign in locally, paste this in the browser console on the Nidus tab:\n')
    console.log(`  document.cookie = 'nidus_reader=${credential}; path=/; max-age=31536000'\n`)
    console.log('Then reload. Keep it out of git, screenshots and chat.')
  } else {
    console.log('\nProfile already existed; shelf updated and credential left alone.')
    console.log('Lost it? Re-run with --rotate to issue a new one (the old stops working).')
  }
  console.log()
} finally {
  await sql.end()
}
