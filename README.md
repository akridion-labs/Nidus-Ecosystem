# nidus-pilot

Slices **P01–P03** of `Nidus_Website_Development_Plan.md`. Nothing beyond P03 exists.

```bash
npm install
npm test     # node:test, 20 assertions over the contracts and the ranker
npm run dev
npm run build
```

## What is here

| Slice | Where | Acceptance evidence |
|---|---|---|
| P01 catalogue and contracts | `src/domain/contracts.ts`, `src/domain/catalogue.ts`, `src/data/catalogue.seed.ts` | 14 seed editions load; 2 deliberately broken fixture rows are rejected with reasons instead of crashing; duplicate ids rejected; a non-array catalogue survives |
| P02 mode-aware ranker | `src/domain/ranker.ts` | eligibility / mode routing / scoring / diversity / explanation are five separate functions; every decision carries `RANKER_VERSION` and reasons that sum to its score |
| P03 choice flow | `src/App.tsx`, `src/index.css` | mobile-first, native radio/`<details>` controls so it is keyboard usable, warm low-contrast-glare palette, empty state, language-gap state, reject-with-reason |

Catalogue facts (title, author, languages, ISBN) are kept apart from editorial
inferences (modes, difficulty, founder stages) so a provenance review can replace
one without touching the other. **No seed row claims to be verified**: every
`provenance.confirmedAt` is `null` and the UI says so on every card. A test
enforces that.

## What is deliberately not here

- **P04+**: no persistence, no consent record, no cookie, no account, no session
  ladder, no feedback capture, no operator view, no retention job. Reload and the
  page forgets everything. Do not put this in front of participants as a
  feedback-collecting pilot — that needs P04–P08 per the plan.
- **No deployment.** No Cloudflare/D1, no Hostinger, no bare-metal config, no DNS.
- **No Three.js, Lenis, confetti or rate limiting.** The plan's P01–P03 do not call
  for them and an eye-strain-friendly reading tool is not the place to start.

## Known ceilings

- Zod ships whole into the browser bundle (~324 kB raw / ~99 kB gzip). Swap to
  `zod/mini` or move validation server-side once P04 adds an API.
- Ranker weights in `MODE_WEIGHTS` and the `PURPOSE_TOPICS` map are editorial
  guesses, not validated. Bump `RANKER_VERSION` whenever you change them so old
  explanations stay traceable.
- Diversity selection is a two-pass topic scan — fine at catalogue sizes in the
  hundreds, revisit past that.
- `npm run build` fails with `EPERM` when the folder is mounted read-only for
  deletes (Cowork device session). Build elsewhere with
  `npx vite build --outDir ~/nidus-build --emptyOutDir` in that case.

## Next

P04, consent and saved journey. Read `../Nidus_00_Start_Here.md` first.
