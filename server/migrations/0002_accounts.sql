-- Accounts: invite codes first, Google second. P04b.
--
-- Two doors on purpose. The subsidised tier in the strategy includes readers
-- with no Google account and some sharing a phone; if Google were the only
-- door, that tier would be designed out by the login screen. The invite code
-- needs no email, no account and no device of one's own, and it is also the
-- simpler thing to build, so it comes first.
--
-- The rules from DR-007 and the accounts note, enforced here rather than
-- trusted:
--   1. Google is keyed on `sub`, never the email. People change email
--      addresses; `sub` is the stable subject identifier. Keying on email is
--      how two accounts become one person's mess.
--   2. The minimum is stored. `sub`, a display name, and nothing else. No
--      profile photo. The email column exists but is nullable and is written
--      only when the reader has separately consented to be contacted — which
--      is its own consent row, not a silent extra.
--   3. Deleting a reader unlinks Google, because these columns live ON the
--      readers row and the invite redemption cascades. The cascade test
--      enumerates every table with a reader_id from the system catalogue, so a
--      table added later without one fails the test rather than leaking.

ALTER TABLE readers
  ADD COLUMN IF NOT EXISTS google_sub   text UNIQUE,
  ADD COLUMN IF NOT EXISTS display_name text,
  -- Nullable, and only ever written alongside a contact consent row.
  ADD COLUMN IF NOT EXISTS email        text;

-- 0001 made credential_hash NOT NULL, which would make a Google-only reader
-- impossible and the CHECK below trivially true. Drop the NOT NULL and let the
-- CHECK carry the rule instead: a reader must be reachable by at least one
-- route, by whichever one they used.
ALTER TABLE readers ALTER COLUMN credential_hash DROP NOT NULL;

ALTER TABLE readers
  DROP CONSTRAINT IF EXISTS readers_has_some_identity;
ALTER TABLE readers
  ADD CONSTRAINT readers_has_some_identity
  CHECK (credential_hash IS NOT NULL OR google_sub IS NOT NULL);

-- Invite codes. One code, one reader, once.
CREATE TABLE IF NOT EXISTS invites (
  code         text PRIMARY KEY,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Null until redeemed. ON DELETE SET NULL rather than CASCADE: deleting a
  -- reader must not silently resurrect a spent code as reusable, but it must
  -- also not delete the operator's record that the code existed.
  redeemed_by  uuid REFERENCES readers(id) ON DELETE SET NULL,
  redeemed_at  timestamptz,
  -- Redeemed means both columns, or neither. A half-redeemed code is a bug
  -- the database should refuse rather than a state the code must handle.
  CONSTRAINT invites_redeemed_together
    CHECK ((redeemed_by IS NULL) = (redeemed_at IS NULL)),
  -- Spent codes stay spent even if the reader is later deleted.
  spent        boolean NOT NULL DEFAULT false,
  CONSTRAINT invites_spent_when_redeemed
    CHECK (spent OR redeemed_at IS NULL)
);

CREATE INDEX IF NOT EXISTS invites_unspent ON invites (created_at) WHERE NOT spent;

-- Sign-in attempts, for rate limiting and for answering "who got in and when".
-- No reader_id: a failed attempt has no reader, and a successful one is
-- already on the audit_log. This table is operational and is pruned by date.
CREATE TABLE IF NOT EXISTS signin_attempts (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  route       text        NOT NULL CHECK (route IN ('invite', 'google')),
  outcome     text        NOT NULL CHECK (outcome IN ('ok', 'rejected')),
  -- Truncated to a /24 so it is useful for rate limiting and poor for
  -- identifying a person. Never the full address.
  ip_prefix   text
);

CREATE INDEX IF NOT EXISTS signin_attempts_recent ON signin_attempts (at DESC);
