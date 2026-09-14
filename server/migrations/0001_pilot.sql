-- Nidus pilot schema, P04-P06. Hand-written so it can be reviewed line by line,
-- as the website plan requires. PostgreSQL 16.
--
-- Three rules this schema enforces rather than trusts:
--   1. Every row that belongs to a reader carries reader_id and cascades on
--      delete, so "delete my data" is one statement that cannot miss a table.
--   2. A check-in is a ROW with a unique constraint on (reader_id, local_day),
--      never a JSON array that concurrent writes can clobber.
--   3. A changed weekly goal is a NEW row with its own effective_from. History
--      is never rewritten.

CREATE TABLE IF NOT EXISTS readers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SHA-256 of the opaque credential. The credential itself is never stored.
  credential_hash  text        NOT NULL UNIQUE,
  -- The reader's chosen timezone decides what "today" means for a check-in.
  timezone         text        NOT NULL DEFAULT 'Asia/Kolkata',
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  -- Retention: rows past this date are deleted by the cleanup job.
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '30 days'
);

-- Consent is versioned and revocable, and research consent is separate from
-- any future contact permission.
CREATE TABLE IF NOT EXISTS consent_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_id         uuid        NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  consent_version   text        NOT NULL,
  -- Exactly what was disclosed at the moment of consent, kept verbatim.
  disclosed_fields  jsonb       NOT NULL,
  research_consent  boolean     NOT NULL,
  contact_consent   boolean     NOT NULL DEFAULT false,
  granted_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz
);
CREATE INDEX IF NOT EXISTS consent_reader_idx ON consent_records (reader_id);

CREATE TABLE IF NOT EXISTS journeys (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_id         uuid        NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  work_id           text        NOT NULL,
  edition_id        text        NOT NULL,
  mode              text        NOT NULL CHECK (mode IN ('enjoy','explore','apply')),
  purpose           text        NOT NULL,
  language          text        NOT NULL,
  -- Which rules produced this recommendation. Without these a later change
  -- cannot be explained, only argued about.
  ranker_version    text        NOT NULL,
  catalogue_version text        NOT NULL,
  status            text        NOT NULL DEFAULT 'reading'
                      CHECK (status IN ('reading','finished','paused','abandoned')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz
);
CREATE INDEX IF NOT EXISTS journeys_reader_idx ON journeys (reader_id);

-- A changed goal inserts a new row. Nothing is updated in place.
CREATE TABLE IF NOT EXISTS reading_goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_id       uuid        NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  days_per_week   smallint    NOT NULL CHECK (days_per_week BETWEEN 1 AND 5),
  session_minutes smallint    NOT NULL CHECK (session_minutes BETWEEN 5 AND 240),
  effective_from  date        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reader_id, effective_from)
);

-- One row per reader per local calendar day. The unique constraint is what
-- makes a duplicate or concurrent check-in idempotent instead of double-counted.
CREATE TABLE IF NOT EXISTS reading_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_id    uuid        NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  journey_id   uuid        REFERENCES journeys(id) ON DELETE SET NULL,
  local_day    date        NOT NULL,
  minutes      smallint    NOT NULL CHECK (minutes > 0 AND minutes <= 600),
  -- Always self-reported. A completed timer proves nothing about attention.
  source       text        NOT NULL DEFAULT 'self-reported',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reader_id, local_day)
);

CREATE TABLE IF NOT EXISTS feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_id   uuid        NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  journey_id  uuid        REFERENCES journeys(id) ON DELETE SET NULL,
  kind        text        NOT NULL CHECK (kind IN
                ('useful','boring','too-busy','too-difficult','not-relevant','did-not-stick')),
  note        text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_reader_idx ON feedback (reader_id);

-- Every adaptation records what it changed FROM and TO, and who decided.
-- Nothing is applied without the reader accepting it.
CREATE TABLE IF NOT EXISTS adaptations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_id      uuid        NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  journey_id     uuid        REFERENCES journeys(id) ON DELETE SET NULL,
  feedback_id    uuid        REFERENCES feedback(id) ON DELETE SET NULL,
  reason         text        NOT NULL,
  before_state   jsonb       NOT NULL,
  after_state    jsonb       NOT NULL,
  status         text        NOT NULL DEFAULT 'proposed'
                   CHECK (status IN ('proposed','accepted','declined')),
  ranker_version text        NOT NULL,
  proposed_at    timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz,
  -- Set when the reader later says whether the change helped. Null = unknown,
  -- and unknown must stay visible rather than counting as success.
  helped         boolean
);
CREATE INDEX IF NOT EXISTS adaptations_reader_idx ON adaptations (reader_id);

-- Append-only. Consent, export and deletion are the actions a pilot has to be
-- able to prove it performed.
CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  reader_id   uuid,
  action      text        NOT NULL,
  detail      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
