# nidus-pilot

Slices **P01–P06** of `Nidus_Website_Development_Plan.md`, built against the
document pack in `../Nidus_Complete_Document_Pack/`. P07–P09 do not exist.

```bash
npm install
npm test              # client domain: 38 assertions, no database needed
npm run dev
npm run build

# Server (P04-P06). Needs PostgreSQL 16+.
cp .env.example .env.local        # then fill DATABASE_URL
npm run migrate
npm run server                    # binds 127.0.0.1 by default, on purpose
TEST_DATABASE_URL=... npm run test:server   # 55 assertions: behaviour, ACID, security
npm run typecheck:server
npm run bench                     # ranker latency at 14 / 1k / 10k / 50k works
```

The database is PostgreSQL, not the Cloudflare D1 in the original plan. The
reasoning and its consequences are in
`../Nidus_Complete_Document_Pack/Nidus_Decision_Record_001_PostgreSQL.md`.

## What is here

**P01 — catalogue and contracts** (`src/domain/contracts.ts`, `src/domain/catalogue.ts`,
`src/data/catalogue.seed.ts`)

Work, Edition and editorial BookProfile are separate records with separate
provenance, per E03-US02 and the research report. Physical Copy belongs to
circulation and is deliberately absent. The reader's relation to a book is a
`CatalogueIntent` (`OWNED` / `READING` / `COMPLETED` / `PURCHASE_PIPELINE` /
`DEFERRED`); a purchase-pipeline entry never becomes an availability claim. The
loader rejects bad rows — including editions pointing at no work, works with no
edition, works with no profile and duplicates — with a stated reason, instead of
throwing. No seeded row claims verification it does not have, and a test enforces
that.

**P02 — mode-aware ranker** (`src/domain/ranker.ts`)

Five separate functions: eligibility, routing, scoring, selection, explanation.

- Eligibility is a binary gate that runs before any scoring: adult confirmed,
  confirmed edition in the requested language, not finished / deferred / rejected,
  suits the chosen mode. Exploration results pass the same gates.
- Routing: Apply + entrepreneurship + a user-confirmed founder context goes to the
  founder branch; everything else to the generic branch. The founder branch
  *replaces* the generic purpose / mode / context terms — it never adds to them,
  so no signal is counted twice.
- Generic weights (research report baseline): purpose 30, mode 20, context 15,
  time and difficulty 15, access 10, confirmed history 10.
- Founder weights (blueprint): purpose 25, stage 20, competency gap 15, decision
  urgency 15, prerequisite readiness 10, actionability 5, access 5, cognitive
  variety 5, minus redundancy 15, too-early 25, active workload 10, clamped 0–100.
- Selection returns strongest fit, adjacent fit and one exploration — roles, not
  the top three rows — and is never padded to three.
- Every decision carries `rankerVersion` **and** `catalogueVersion`, a component
  breakdown that sums to the displayed score, and separate `whyThisBook`,
  `whyNow`, `whyThisMode`, `firstStep`, `realWorldAction`, `cannotDo`,
  `accessRoute`, `recommendedUsage`, `missingPrerequisites`, `deferReason`.

**P03 — choice flow** (`src/App.tsx`, `src/index.css`)

Copy and tokens from `Nidus_UI_UX_and_Model_Independent_Design_Brief.md`: the
"A book for your next chapter." headline, "Find my next read" as the primary
action, "Not right for me" with the seven documented rejection reasons, warm
off-white canvas with navy body text and restrained deep teal actions, amber only
for limits and milestones, 17px body at 1.5 line-height, 44px touch targets,
44–62ch measures. Founder context appears only when the reader chooses to build
something, behind progressive disclosure, with every field confirmed by them.
Verified at 320, 375, 768, 1024 and 1440px with no horizontal overflow.

**P04 — consent and the saved journey** (`server/`)

Nothing is stored until the reader consents, and `GET /api/consent` discloses the
exact field list, the retention period and the honest processing statement first.
A pseudonymous 32-byte credential goes into an HttpOnly, Secure, SameSite=Strict
cookie; only its SHA-256 hash is stored, and a test asserts the credential itself
never appears in the database. Every repository function takes `readerId` first
and filters on it — there is no query in `server/db/repo.ts` that can return a row
without a reader predicate. Mutations need a double-submit CSRF token and an
allowed Origin; bodies are capped at 16 kB; consent, writes and operator routes
are rate-limited separately. The no-save path is tested: every saving route
refuses without consent, and nothing is written.

**P05 — sessions and the adjustable ladder**

A check-in is a row with `UNIQUE (reader_id, local_day)`, so a duplicate or a
burst of concurrent taps produces one day, not several — the constraint decides,
not application code. The day comes from the reader's own timezone, not the
server's. A changed weekly goal inserts a new row with its own `effective_from`;
earlier rows, and therefore the reader's history, are never rewritten. The ladder
endpoint reports "2 of your 3 reading days this week", labels everything
self-reported, and returns no streak.

**P06 — feedback and adaptation**

Structured feedback is kept whether it is positive or negative. Each kind gets its
own response, from the adaptation table in the research report: *too busy*
shortens the plan with no catch-up debt, *boring* asks which kind of boring it was
rather than guessing, *useful* proposes nothing at all. Every adaptation records
`before_state`, `after_state`, the reason and the ranker version, and stays
`proposed` until the reader accepts or declines — a decline is kept too. Whether
a change actually helped is a separate field that starts null, and unknown stays
unknown rather than counting as success.

Also: `GET /api/export` returns everything held about the reader, `DELETE /api/me`
removes it in one cascading statement and says plainly that off-machine backups
are separate, `purgeExpired` enforces the 30-day retention, and the operator
endpoints need their own bearer token and return counts only — there is no route
anywhere that lists every reader's feedback.

## What is deliberately not here

- **P07–P09.** No operator review UI, no release verification pass, no field
  test. The API has counts and a purge; a reviewed operator surface is P07.
- **The client is not wired to the server yet.** `src/App.tsx` still saves
  nothing. P04–P06 is the backend and its tests; connecting the two is the next
  piece of work.
- **My Shelf, My Journey, Today, and the bottom navigation** from the wireframe.
  They need persistence. A navigation bar pointing at screens that do not exist
  would be the kind of promise the documents keep warning about.
- **Loading, retry and request-pending states** in the client. They belong to a
  network call, and the client does not make one yet.
- **Mood, desired experience, carousels, trend badges.** `Nidus_Moods_Trends_and_Carousels.md`
  marks them as a proposed extension, not implemented, and the India trend data
  it needs is unverified.
- **Three.js, Lenis, confetti, the client-side request cap.** The design brief
  rules out heavy 3D and decorative animation libraries on a reading surface, and
  there is no request to cap because the client makes no requests.

## How it is checked

| Suite | What it proves |
|---|---|
| `tests/domain.test.ts` | Named behaviours: gates, weights, branch routing, explanation fields |
| `tests/invariants.test.ts` | 3,000 generated briefs. Every result passed the gates; every score is 0–100 and equals the sum of its own components; no component exceeds its ceiling; neither branch's terms leak into the other; ranking is deterministic. This suite found a real scoring bug — see `RANKER_VERSION` 0.2.1 |
| `server/pilot.test.ts` | P04–P06 behaviour end to end against real PostgreSQL |
| `server/acid.test.ts` | Atomicity, consistency and isolation demonstrated, not asserted in prose. Durability is checked as configuration and documented as a restore nobody has performed yet |
| `server/security.test.ts` | Regression tests for the four findings in `Nidus_Security_And_Correctness_Review_v1.md`, each of which failed before its fix |
| `tools/ranker-bench.ts` | Latency, so "is it fast enough" is answered with a number |

## Known ceilings

- Zod ships whole into the browser bundle (~340 kB raw, ~103 kB gzip). Move
  validation behind the API or switch to `zod/mini` at P04.
- `PURPOSE_TOPICS`, `MODE_WEIGHTS` and the seed's editorial profiles are editorial
  guesses, not validated. Bump `RANKER_VERSION` on any change so old explanations
  stay traceable.
- Catalogue provenance is entirely unconfirmed: no ISBNs, no bibliographic source
  checked. Verify editions before anything is shown publicly.
- Telugu and Tamil coverage is near zero, so the language-gap screen is what most
  Indian-language readers will meet. Honest, but it caps the pilot's reach.
- `npm run build` fails with `EPERM` when the folder is mounted without delete
  permission (Cowork device session). Build elsewhere:
  `npx vite build --outDir ~/nidus-build --emptyOutDir`.

## Next

Wire the client to the API, then P07 (operator review and retention) and P08
(release verification). Read `../Nidus_00_Start_Here.md` first, then
`Nidus_System_Design_v1.md` for the security gates each remaining slice must
clear and `Nidus_Deployment_Strategy_v1.md` for where this may and may not run.

Before any participant sees this: verify the catalogue editions against a real
bibliographic source, run the deletion and retention checks against the actual
database, and perform a restore from backup rather than assuming one works.
