# The Nidus algorithm, compared with what the market actually runs

**Written 3 November 2026.** Asked: *how well is our algorithm, and how does it
compare with others in the market.*

Short answer: **Nidus is a knowledge-based recommender, which is a recognised
family and the one the literature names as useful precisely when there is no
data.** It is not a weak version of what Amazon runs. It is a different thing,
chosen correctly — and it has one genuine advantage and three genuine gaps, all
listed below without softening.

---

## 1. What Nidus actually is, in the field's own words

Recommenders come in families. Nidus sits in two of them:

- **Content-based** — matches item features (topics, difficulty, session
  length) against a stated preference rather than against other people's
  behaviour.
- **Knowledge-based / constraint-based** — applies explicit domain rules:
  *this book is too early for your stage*, *this one assumes you read that
  first*, *you ruled out this shape*. Cold-start write-ups name knowledge-based
  methods as "particularly useful in addressing the cold-start problem",
  including via domain-specific rules.

The second is the better description and the one worth claiming. The eligibility
gates, `tooEarlyStages`, `prerequisites` and the founder-stage distance are not
content matching at all — they are domain knowledge, written down.

## 2. The five families, and why Nidus cannot be most of them

| Family | Who runs it | What it needs | Available to Nidus? |
|---|---|---|---|
| **Collaborative filtering** (item-to-item) | Amazon, Goodreads (Amazon-owned) | A large user × item interaction matrix | **No. Zero users.** Not a choice |
| **Matrix factorisation / embeddings** | Most large catalogues | Same matrix, plus scale | **No** |
| **Sequential / deep** (two-tower, SASRec, BERT4Rec) | Streaming and large e-commerce | Interaction *sequences* per user | **No** |
| **LLM in the request path** | ChatGPT, most 2025–26 "AI book" apps | A model call per request | **Refused** — DR-008, on metering and the subsidised tier |
| **Knowledge-based + content** | Niche, domain-expert products | A curated catalogue and written-down rules | **This is Nidus** |

**The important point: the first three are not better options Nidus declined.
They are impossible at zero users.** Collaborative filtering with no users
returns nothing; it is not a cold-start-tolerant method. Any new recommender
starts where Nidus is. The literature's standard advice is to start
content/knowledge-based and go hybrid once interactions exist.

So "how does our algorithm compare" has two honest halves: **the family is
right**, and **the implementation inside it is unvalidated.**

## 3. The one genuine advantage

**Every score can explain itself, from data rather than from a model.**

The filter-bubble systematic review proposes four mitigations: re-ranking,
diversity modelling, multi-objective optimisation, and **explainability with
user control** — and notes explicitly that the authors propose the last one but
the review does not test it. Nidus ships it: the score breakdown, the component
text, the refusals printed next to the result.

That is a real position, stated carefully: **not proven to help, but it is the
thing researchers say should be tried and almost nobody ships.** Amazon cannot
tell you why. ChatGPT can produce a fluent reason that is not the reason.

Nidus also has **diversity modelling in the core algorithm** rather than as a
re-ranking pass: `cognitive-variety` is a scored term, which is the review's
second category. That is a deliberate counter to content-based
overspecialisation, which is the known failure mode of this family — a system
that keeps handing you more of what you already chose.

## 4. The three genuine gaps

### 4a. The weights have never been validated against anything

`purpose 25 · stage 20 · competencyGap 15 · decisionUrgency 15 ·
prerequisiteReadiness 10 · actionability 5 · access 5 · cognitiveVariety 5`

**Those numbers were chosen, not fitted.** No A/B test, no offline evaluation
against held-out data, no ground truth. There is no evidence that 25 for
purpose beats 15, and no way to get any until people use it.

This is the largest gap and **more code cannot close it.** It is what
Experiment 001 begins to address — and even that tests the whole system against
rivals, not the weights against each other.

### 4b. Nothing learns

Until today, nothing in the ranker changed from use. The rejection fix (3 Nov)
is the first within-session adaptation: saying "too difficult" now affects other
books. **Nothing persists across sessions to improve ranking** — the shelf
persists, but it informs eligibility, not weights.

A production recommender retrains. Nidus has no training loop and, with no
interaction data, nothing to train on. Correct for now; a real ceiling.

### 4c. There was no offline evaluation at all

Standard practice is precision@k, NDCG or MAP against held-out interactions.
Nidus has none of that data — but until today it had **no ranking evaluation of
any kind**, which is why the `focusFit` cap survived weeks of edits. Every check
was "does this return a number" or a human reading three results.

**Fixed, partially: `npm run eval`** — `tools/ranker-eval.mjs`, twelve cases.
And it is labelled honestly in its own header, because this matters: the cases
are **judgements written by the same process that wrote the ranker**, so they
are worthless as evidence that the recommendations are good. Grading your own
homework is what Experiment 001 exists to avoid.

What it *is* worth is catching the change that breaks something that used to
work:

```
quality     -> Experiment 001, eight blinded readers
regression  -> npm run eval, on every ranker change
```

**The first thing it caught was a wrong expectation of mine, not a ranker bug.**
A case asserted The $100 Startup by title; the ranker returned Continuous
Discovery Habits, The Mom Test and Obviously Awesome, which are the right
answers for a founder who does not yet know whether anyone will pay. The case
was rewritten to assert what it meant. That is mostly what an evaluation harness
does early: it forces you to write down what you believe, and some of it is
wrong.

## 5. Where Nidus is simply small

- **93 works** against catalogues of millions. For a product that returns *one*
  book this is more defensible than it sounds, but it caps who can be served.
- **90 of 93 bibliographic rows unconfirmed.** The UI says so.
- **English only** in practice, in a market where the vernacular competitor
  (Kuku FM) raised $85M.
- **No audio or ebook editions at all**, which is the format a commuter uses.

## 6. The honest scorecard

| | Nidus | Typical production recommender |
|---|---|---|
| Works at zero users | **Yes** | No |
| Explains its reasoning from data | **Yes** | Rarely |
| Refuses rather than guesses | **Yes** | No |
| Domain constraints (stage, prerequisites) | **Yes** | Rarely |
| Weights validated against outcomes | **No** | Yes |
| Learns from use | **No** | Yes |
| Offline evaluation on real data | **No** | Yes |
| Catalogue scale | 93 | 10⁵–10⁷ |
| Personalisation beyond a stated brief | **No** | Yes |

**Read that honestly: Nidus wins the first four rows and loses the rest.** The
first four are what a product with no users can win, and they are the ones that
compound into trust. The rest are what users buy you, and the only way to get
them is item 0 of the roadmap.

## 7. What to do next, in order

1. **Run Experiment 001.** Nothing on this page beats eight readers choosing
   blind. Every gap in §4 traces to not having done it.
2. **Run `npm run eval` on every ranker change.** It is in `npm run check` now.
3. **Build the shelf-balance term** the October shelf map proposed: when a
   reader has taken four books from one shelf and none from another their stage
   needs, say so rather than handing over a fifth from the same pile. It is the
   one scoring idea on this page that no competitor has, it needs no users, and
   the shelf is now persisted so it can be computed.
4. **Do not add a model to the request path.** DR-008 stands; nothing in this
   comparison changes it.

Sources consulted for the family and cold-start claims are listed in the chat
log for this date; the filter-bubble review is arXiv 2307.01221, and the
cold-start framing is from general practitioner write-ups rather than a single
authority — none of them addresses a system with literally zero interactions,
which is worth knowing when reading advice about cold start.
