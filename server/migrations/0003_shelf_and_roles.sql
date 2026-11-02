-- The shelf, and one role. P04c.
--
-- WHY A SHELF TABLE AT ALL
--
-- `journeys` records a reading journey Nidus produced: it needs an edition, a
-- mode, a purpose and a ranker version, because its job is to explain a
-- recommendation later. A shelf is a different fact and a weaker one: "I own
-- this", "I finished this", "I gave up on this" — true whether or not Nidus
-- ever suggested it, and true for the thirty-three books that were on the
-- shelf before this product existed.
--
-- Forcing a shelf into `journeys` would mean inventing a ranker_version for a
-- book bought in 2019. The ranker's own contract already has the right shape
-- (`ReadingBrief.intents`), and until now it existed only in the browser's
-- memory and died on reload. This is that contract, persisted.
--
-- The point of storing it is not tidiness. The ranker refuses to offer a book
-- you have finished and uses what you own to decide what is reachable, so a
-- shelf that survives a reload is the difference between a recommender that
-- knows you and one that meets you for the first time every visit.

CREATE TABLE IF NOT EXISTS book_intents (
  reader_id   uuid        NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  -- Deliberately NOT a foreign key to a works table: the catalogue ships in
  -- the bundle and is versioned with the code, not stored here. A reader may
  -- also mark a book Nidus does not stock, and losing that is worse than the
  -- referential integrity is worth.
  work_id     text        NOT NULL,
  status      text        NOT NULL
                CHECK (status IN ('OWNED','READING','COMPLETED','PURCHASE_PIPELINE','DEFERRED')),
  -- Free text, the reader's own words. Never shown to anyone else.
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- One row per reader per book. Changing your mind updates the row rather
  -- than appending a second opinion the ranker would then have to choose
  -- between.
  PRIMARY KEY (reader_id, work_id)
);

CREATE INDEX IF NOT EXISTS book_intents_reader ON book_intents (reader_id);

-- One role, server-side.
--
-- DR-009 settled the shape: the master login is a ROLE ON DEEPAK'S OWN
-- ACCOUNT, never a separate door and never a client-side boolean. A flag in
-- the bundle ships to every visitor and anything it checks, a visitor flips in
-- the console in about ten seconds. This column is the whole mechanism, and it
-- is checked on the server on every request that depends on it.
--
-- Two values, not a permissions system. A third is a decision to take when
-- there is a second kind of privileged person, which there is not.
ALTER TABLE readers
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'reader';

ALTER TABLE readers DROP CONSTRAINT IF EXISTS readers_role_known;
ALTER TABLE readers
  ADD CONSTRAINT readers_role_known CHECK (role IN ('reader','admin'));

-- An admin is granted by someone with database access, deliberately. There is
-- no route that promotes an account, because a route that grants admin is a
-- route that can be tricked into granting admin.
