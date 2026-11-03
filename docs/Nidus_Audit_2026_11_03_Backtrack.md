# Backtrack audit — 3 November 2026

Asked: *how well is our algorithm, let's backtrack and check if we missed any
changes or anything we can fix.*

Four things were found. **All four were working code with nothing behind it** —
not one was a wrong calculation. That is now the dominant failure mode in this
project and worth naming as a pattern rather than four incidents.

Everything below was fixed in commit `bf811cf` unless marked still open.

---

## 1. Seven rejection buttons, one behaviour — **the big one**

`REJECTION_REASONS` has carried this comment since the day it was written:

> **"The documented rejection reasons. The same click means different things."**

The ranker did this:

```ts
if (brief.rejections.some((r) => r.workId === item.work.id)) {
  return { ok: false, kind: 'rejected', reason: 'set aside in this session' }
}
```

**It read `workId` and never `reason`.** Seven buttons, one outcome: remove that
one book. Verified by grep — zero reads of `.reason` anywhere in the ranker.

What a reader actually experienced:

| They clicked | What they meant | What happened |
|---|---|---|
| Too difficult | *stop showing me hard books* | one fewer hard book; the next was just as hard |
| I cannot get it | *stop showing me things I must buy* | another book to buy |
| Repetitive | *I am tired of this subject* | another book on the same subject |
| Not relevant to me | *wrong area entirely* | another book in the same area |

This is **the sixth time** a signal has existed here with nothing consuming it,
and it is the most expensive one, because rejection is the only feedback loop a
reader has *inside* a session. Everything else adapts between visits.

### The fix, and what deliberately does not generalise

Three reasons say something about **other** books and are now constraints:

- `too-difficult` → books at or above that difficulty are marked down
- `unavailable` → books you would have to buy are marked down
- `repetitive` / `not-relevant` → books sharing the rejected book's topics

Four say something about **this book only**, and inventing a rule from them
would be the product guessing:

- `unappealing` — **taste is not a topic.** A test asserts this one changes
  nothing about other books
- `already-read` — belongs in `intents` as COMPLETED
- `wrong-language` — the language gate already owns it

They are **demotions, not bans** (−12), charged **once** however many ways they
apply, and the reason is printed on screen as a `you-said-no` row. A score that
drops for an invisible reason is the thing this product exists not to do.

Proven end to end:

```
rejected "flatland" as repetitive ->
  malgudi-days          53/100     ← now top, a genuinely different book
  stories-of-your-life  50.5/100   ← "Marked down because it covers science
                                      fiction and judgement, which you have
                                      just set aside."
```

Seven new tests. Three of them fail against the old behaviour — checked by
reverting the fix and watching them go red.

## 2. The shape filter was curation wearing a filter's clothes

The project brief's headline promise is *filtering out low-value relationship
drama*. The gate works and has its own tests. But:

**92 of 93 rows carried no shape at all.** Only *The Martian* was tagged, as
`suspense`. So:

- Ticking **"Books driven by who wants whom"** removed **nothing**
- Ticking **"Horror"** could never remove anything — none is stocked

The promise was being kept by **careful buying**, not by the code. That works
until one untagged book is added, and nothing would have caught it.

**Fixed:** *The Fountainhead* is tagged `relationship-drama` — Roark and
Dominique is a central thread, not a subplot, and it includes a scene widely
read as rape. It is also on Deepak's own shelf, so the filter now does
something for the person who asked for it. `horror` is **removed from the
offered shapes** until something horror is stocked: offering a filter for stock
you do not hold implies you hold it.

**A test now fails if any shape offered to a reader is carried by no book.**

Proven:

```
avoid off -> fountainhead eligible: true
avoid on  -> EXCLUDED, shape: "you ruled out relationship drama"
```

## 3. The accessibility audit was shouting loudly enough to hide a real failure

`tools/viewport-audit.mjs` implements WCAG 2.5.8's **Inline exception** — a
target inside a sentence, sized by the line-height around it, is exempt. Its
guard began:

```js
if (!parent || el.tagName === 'A') return false
```

**It excluded `<a>` — the element the Inline exception mostly exists for.**
Every flagged target was a link in prose, and the "fix" for each would have been
to pull the link out of the paragraph and make the page worse.

Behind that noise sat **a genuine AA failure**. The study citations added on
27 October are 17px tall *and are the entire paragraph* — 65 characters of link
in a 65-character `<p>`. Not a word in a sentence, so the exception never
covered them, and the noise meant nobody looked.

Both fixed: the exemption now tests structure (`inline` or `inline-block`,
parent `P`/`LI`/`SPAN`, surrounding text materially longer than the target), and
the citation links are `inline-block` with padding so they clear 24px.

## 4. The audit tooling was never a dependency

`playwright-core` and `axe-core` were installed ad hoc and **never declared in
`package.json`**. So `npm audit fix` pruned them, and the accessibility claim
this project has repeated in a dozen commit messages became unverifiable
*without the failure being visible*. Same family as the migrate and
`build:single` silent failures.

Declared as devDependencies.

**And the claim itself was wrong.** Every commit message and the status doc said
*eleven viewports, 320×568 → 1920×1080*. The committed tool ran **three**
(430, 768, 1440). It now runs the eleven, and they pass.

```
clean across 11 widths
```

That is the **first time** this tool has returned clean on its own exit code,
rather than someone reading "0 axe violations" past a non-zero exit.

## 5. Also fixed

**`npm audit` was 4, not 0** — `body-parser` (high, DoS), `vite`/`launch-editor`
(3 high, Windows command execution), `qs` (moderate), `zod` (high). All fixed,
0 remaining. There is still **no CI**, so this runs when a person remembers.

---

## Still open, deliberately

**The `focusFit` topic cap.** Overlap is capped at two hits, so a book matching
all four named topics scores identically to one matching two. Found 2 November:
asked for business judgement, *Prisoners of Geography* (93) beat *Good Strategy
Bad Strategy* (74.5), both at the cap, with cognitive-variety breaking the tie.

Arguably correct for a reader with eleven mindset books — variety is weighted on
purpose. But it should be a decision, not an inheritance. **Not changed here**,
because the cap was added for a real reason (seven topics once made every book
tie) and raising it is a design call, not a patch. It belongs in a batch with
the balance-warning component the October shelf map proposed.

---

## The pattern, stated once

Six of this project's findings are now the same shape: **a signal exists, is
documented, has a UI, and nothing consumes it.** Rejection reasons. The shape
tags. The aspiration topics. The typed sentence. The memory promise. The
confirmed-history term.

The common cause is that both halves look finished independently. The contract
is written, the UI collects the input, the gate runs — and the wire between them
is the part no test covers, because a test of either half passes.

**The check that would have caught all six:** for every input the UI collects,
is there an assertion that changing it changes the output? That is a different
question from "does the function work", and it is the one this project keeps
answering late.

Four of the six were found by asking it. It is worth making standing.
