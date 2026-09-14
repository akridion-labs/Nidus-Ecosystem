# nidus-pilot

Slices **P01–P03** of `Nidus_Website_Development_Plan.md`, built against the
document pack in `../Nidus_Complete_Document_Pack/`. Nothing beyond P03 exists.

```bash
npm install
npm test     # node:test — 34 assertions over the contracts, gates and both rankers
npm run dev
npm run build
```

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

## What is deliberately not here

- **P04–P09.** No persistence, consent record, cookie, saved journey, session
  ladder, feedback capture, adaptation, operator view or retention job. Reload and
  the page forgets everything. This must not be put in front of participants as a
  feedback-collecting pilot — that needs P04–P08.
- **My Shelf, My Journey, Today, and the bottom navigation** from the wireframe.
  They need persistence. A navigation bar pointing at screens that do not exist
  would be the kind of promise the documents keep warning about.
- **Loading, retry and request-pending states.** They belong to a network call.
  Ranking is a synchronous pure function today, so a spinner would be theatre.
- **Mood, desired experience, carousels, trend badges.** `Nidus_Moods_Trends_and_Carousels.md`
  marks them as a proposed extension, not implemented, and the India trend data
  it needs is unverified.
- **Three.js, Lenis, confetti, the client-side request cap.** The design brief
  rules out heavy 3D and decorative animation libraries on a reading surface, and
  there is no request to cap because the client makes no requests.

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

P04, consent and saved journey. Read `../Nidus_00_Start_Here.md`, then
`../Nidus_Complete_Document_Pack/Nidus_System_Design_v1.md` for the security gates
each remaining slice has to clear.
