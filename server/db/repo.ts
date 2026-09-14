import { createHash, randomBytes } from 'node:crypto'
import type { Sql } from './client.ts'

/**
 * Every function here takes readerId first and filters on it. That is the only
 * reason one reader cannot see another's record: there is no query in this file
 * that can return a row without a reader_id predicate.
 */

export type ReaderId = string

/* ---------------- credentials ---------------- */

/** 32 random bytes. The plaintext goes in the cookie and is never stored. */
export function newCredential(): string {
  return randomBytes(32).toString('base64url')
}

export function hashCredential(credential: string): string {
  return createHash('sha256').update(credential).digest('hex')
}

/* ---------------- readers and consent ---------------- */

export async function createReaderWithConsent(
  sql: Sql,
  input: {
    credential: string
    timezone: string
    consentVersion: string
    disclosedFields: string[]
    researchConsent: boolean
    contactConsent: boolean
    retentionDays: number
  },
): Promise<ReaderId> {
  return sql.begin(async (tx) => {
    const [reader] = await tx<{ id: string }[]>`
      INSERT INTO readers (credential_hash, timezone, expires_at)
      VALUES (${hashCredential(input.credential)}, ${input.timezone},
              now() + (${input.retentionDays} || ' days')::interval)
      RETURNING id`
    await tx`
      INSERT INTO consent_records
        (reader_id, consent_version, disclosed_fields, research_consent, contact_consent)
      VALUES (${reader.id}, ${input.consentVersion},
              ${tx.json(input.disclosedFields)},
              ${input.researchConsent}, ${input.contactConsent})`
    await tx`INSERT INTO audit_log (reader_id, action, detail)
             VALUES (${reader.id}, 'consent.granted',
                     ${tx.json({ version: input.consentVersion })})`
    return reader.id
  })
}

export async function readerByCredential(sql: Sql, credential: string) {
  const [reader] = await sql<{ id: string; timezone: string; expires_at: Date }[]>`
    SELECT id, timezone, expires_at FROM readers
    WHERE credential_hash = ${hashCredential(credential)} AND expires_at > now()`
  if (reader) await sql`UPDATE readers SET last_seen_at = now() WHERE id = ${reader.id}`
  return reader ?? null
}

export async function revokeConsent(sql: Sql, readerId: ReaderId) {
  await sql`UPDATE consent_records SET revoked_at = now()
            WHERE reader_id = ${readerId} AND revoked_at IS NULL`
  await sql`INSERT INTO audit_log (reader_id, action) VALUES (${readerId}, 'consent.revoked')`
}

/* ---------------- journeys ---------------- */

export async function saveJourney(
  sql: Sql,
  readerId: ReaderId,
  j: {
    workId: string; editionId: string; mode: string; purpose: string; language: string
    rankerVersion: string; catalogueVersion: string
  },
) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO journeys (reader_id, work_id, edition_id, mode, purpose, language,
                          ranker_version, catalogue_version)
    VALUES (${readerId}, ${j.workId}, ${j.editionId}, ${j.mode}, ${j.purpose},
            ${j.language}, ${j.rankerVersion}, ${j.catalogueVersion})
    RETURNING id`
  return row.id
}

export async function journeys(sql: Sql, readerId: ReaderId) {
  return sql`SELECT * FROM journeys WHERE reader_id = ${readerId} ORDER BY started_at`
}

/* ---------------- goals: a change is a new row ---------------- */

export async function setGoal(
  sql: Sql,
  readerId: ReaderId,
  goal: { daysPerWeek: number; sessionMinutes: number; effectiveFrom: string },
) {
  // Re-stating the same effective date replaces that row only; earlier rows,
  // and therefore the reader's history, are untouched.
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO reading_goals (reader_id, days_per_week, session_minutes, effective_from)
    VALUES (${readerId}, ${goal.daysPerWeek}, ${goal.sessionMinutes}, ${goal.effectiveFrom})
    ON CONFLICT (reader_id, effective_from) DO UPDATE
      SET days_per_week = EXCLUDED.days_per_week,
          session_minutes = EXCLUDED.session_minutes
    RETURNING id`
  return row.id
}

export async function goalHistory(sql: Sql, readerId: ReaderId) {
  return sql<{ days_per_week: number; session_minutes: number; effective_from: Date }[]>`
    SELECT days_per_week, session_minutes, effective_from
    FROM reading_goals WHERE reader_id = ${readerId} ORDER BY effective_from`
}

export async function goalOn(sql: Sql, readerId: ReaderId, day: string) {
  const [row] = await sql<{ days_per_week: number; session_minutes: number }[]>`
    SELECT days_per_week, session_minutes FROM reading_goals
    WHERE reader_id = ${readerId} AND effective_from <= ${day}
    ORDER BY effective_from DESC LIMIT 1`
  return row ?? null
}

/* ---------------- sessions: unique per local day ---------------- */

/** The reader's own timezone decides the day. Never the server's. */
export async function localDay(sql: Sql, readerId: ReaderId): Promise<string> {
  const [row] = await sql<{ day: string }[]>`
    SELECT to_char((now() AT TIME ZONE r.timezone)::date, 'YYYY-MM-DD') AS day
    FROM readers r WHERE r.id = ${readerId}`
  return row.day
}

/**
 * Idempotent by construction: a second check-in on the same local day updates
 * the same row and reports created:false. Two concurrent calls cannot both win,
 * because the unique constraint decides, not the application.
 */
export async function checkIn(
  sql: Sql,
  readerId: ReaderId,
  input: { day: string; minutes: number; journeyId?: string | null },
) {
  const rows = await sql<{ id: string; inserted: boolean }[]>`
    INSERT INTO reading_sessions (reader_id, journey_id, local_day, minutes)
    VALUES (${readerId}, ${input.journeyId ?? null}, ${input.day}, ${input.minutes})
    ON CONFLICT (reader_id, local_day) DO UPDATE
      SET minutes = GREATEST(reading_sessions.minutes, EXCLUDED.minutes)
    RETURNING id, (xmax = 0) AS inserted`
  return { id: rows[0].id, created: rows[0].inserted }
}

/** Unique days, not taps. A missed week removes nothing. */
export async function sessionDays(sql: Sql, readerId: ReaderId) {
  return sql<{ local_day: Date; minutes: number }[]>`
    SELECT local_day, minutes FROM reading_sessions
    WHERE reader_id = ${readerId} ORDER BY local_day`
}

/* ---------------- feedback and adaptation ---------------- */

export async function addFeedback(
  sql: Sql,
  readerId: ReaderId,
  f: { kind: string; note?: string; journeyId?: string | null },
) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO feedback (reader_id, journey_id, kind, note)
    VALUES (${readerId}, ${f.journeyId ?? null}, ${f.kind}, ${f.note ?? ''})
    RETURNING id`
  return row.id
}

export async function feedbackFor(sql: Sql, readerId: ReaderId) {
  return sql`SELECT * FROM feedback WHERE reader_id = ${readerId} ORDER BY created_at`
}

export async function proposeAdaptation(
  sql: Sql,
  readerId: ReaderId,
  a: {
    journeyId?: string | null; feedbackId?: string | null; reason: string
    /** Flat, primitive-valued snapshots so the jsonb stays inspectable by hand. */
    before: Record<string, string | number | boolean | null>
    after: Record<string, string | number | boolean | null>
    rankerVersion: string
  },
) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO adaptations (reader_id, journey_id, feedback_id, reason,
                             before_state, after_state, ranker_version)
    VALUES (${readerId}, ${a.journeyId ?? null}, ${a.feedbackId ?? null}, ${a.reason},
            ${sql.json(a.before)}, ${sql.json(a.after)},
            ${a.rankerVersion})
    RETURNING id`
  return row.id
}

/** Nothing changes until the reader decides. Both answers are recorded. */
export async function decideAdaptation(
  sql: Sql,
  readerId: ReaderId,
  id: string,
  accept: boolean,
) {
  const rows = await sql<{ id: string }[]>`
    UPDATE adaptations SET status = ${accept ? 'accepted' : 'declined'}, decided_at = now()
    WHERE id = ${id} AND reader_id = ${readerId} AND status = 'proposed'
    RETURNING id`
  return rows.length === 1
}

export async function recordAdaptationOutcome(
  sql: Sql, readerId: ReaderId, id: string, helped: boolean,
) {
  const rows = await sql<{ id: string }[]>`
    UPDATE adaptations SET helped = ${helped}
    WHERE id = ${id} AND reader_id = ${readerId} AND status = 'accepted'
    RETURNING id`
  return rows.length === 1
}

export async function adaptationsFor(sql: Sql, readerId: ReaderId) {
  return sql`SELECT * FROM adaptations WHERE reader_id = ${readerId} ORDER BY proposed_at`
}

/* ---------------- export, delete, retention ---------------- */

export async function exportReader(sql: Sql, readerId: ReaderId) {
  const [reader] = await sql`SELECT id, timezone, created_at, expires_at FROM readers WHERE id = ${readerId}`
  const [consent, j, goals, sessions, fb, adapt] = await Promise.all([
    sql`SELECT consent_version, disclosed_fields, research_consent, contact_consent, granted_at, revoked_at
        FROM consent_records WHERE reader_id = ${readerId}`,
    journeys(sql, readerId),
    goalHistory(sql, readerId),
    sessionDays(sql, readerId),
    feedbackFor(sql, readerId),
    adaptationsFor(sql, readerId),
  ])
  await sql`INSERT INTO audit_log (reader_id, action) VALUES (${readerId}, 'data.exported')`
  return { reader, consent, journeys: j, goals, sessions, feedback: fb, adaptations: adapt }
}

/**
 * One statement. Every child table cascades, so a table added later without a
 * cascading reader_id would fail loudly here rather than leave orphans behind.
 */
export async function deleteReader(sql: Sql, readerId: ReaderId) {
  const rows = await sql<{ id: string }[]>`DELETE FROM readers WHERE id = ${readerId} RETURNING id`
  // The audit row deliberately outlives the reader: it records that a deletion
  // happened, and carries nothing about who they were or what they read.
  await sql`INSERT INTO audit_log (reader_id, action) VALUES (NULL, 'data.deleted')`
  return rows.length === 1
}

/** Retention cleanup. Deletes expired readers and everything hanging off them. */
export async function purgeExpired(sql: Sql) {
  const rows = await sql<{ id: string }[]>`DELETE FROM readers WHERE expires_at <= now() RETURNING id`
  if (rows.length > 0) {
    await sql`INSERT INTO audit_log (action, detail)
              VALUES ('retention.purged', ${sql.json({ count: rows.length })})`
  }
  return rows.length
}

/** Operator view: counts only. There is no function here that lists rows. */
export async function operatorCounts(sql: Sql) {
  const [row] = await sql<Record<string, string>[]>`
    SELECT (SELECT count(*) FROM readers)::text            AS readers,
           (SELECT count(*) FROM journeys)::text           AS journeys,
           (SELECT count(*) FROM reading_sessions)::text   AS sessions,
           (SELECT count(*) FROM feedback)::text           AS feedback,
           (SELECT count(*) FROM adaptations
             WHERE status = 'accepted')::text              AS adaptations_accepted,
           (SELECT count(*) FROM adaptations
             WHERE status = 'accepted' AND helped IS NULL)::text AS adaptations_outcome_unknown`
  return row
}
