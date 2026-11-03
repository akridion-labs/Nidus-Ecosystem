# Customer research on the website changes — 3 November 2026

**Goal:** test whether the changes made to the site this week are things real
readers want, or things we wanted.

**The honest headline first.** Nidus has **two first-party data points** — one
interview round and one Gen Z response — and **zero users**. Everything else
below is **proxy research**: readers of other products describing why those
products fail them. Proxy evidence can tell you which bets are plausible. It
cannot tell you that Nidus works, and nothing here replaces Experiment 001.

Confidence is labelled on every claim, using the standard in the research
skill: **High** = 3+ independent sources, unprompted, consistent;
**Medium** = 2 sources, or prompted, or one segment; **Low** = single source.

---

## 1. The disconfirming quote, placed first on purpose

From a Goodreads discussion thread of readers arguing about why recommendation
engines fail:

> **"The irony of these book recommendation engines is that they seek to solve
> a problem that society doesn't have."** — Tiffani

That is the strongest single statement in everything gathered, and it is
against us. It belongs at the top rather than in a footnote, because a research
report that leads with the supporting quotes and buries this one is marketing
with citations.

It is also **testable**, and Experiment 001 tests it: if a reader's own blind
pick is no better from Nidus than from a bestseller list or a friend, Tiffani
is right about Nidus specifically.

## 2. What the research supports, change by change

| Change made this week | Evidence | Confidence |
|---|---|---|
| **"I already own it" control** | Readers abandon engines over exactly this. Dottie: Amazon *"plugs many books I've already read"* and without an already-read or own-it option she ignores suggestions **entirely**. Sara wants Audible to *"stop suggesting Gone Girl."* Peggy: it *"took forever for Amazon to realize I wasn't ever going to"* buy more of a category | **Medium–High** — multiple independent voices, unprompted, one thread |
| **Rejection reasons that generalise** (the seven-buttons-one-behaviour fix) | Several readers in the same thread specifically praise the ability to exclude purchases, mark titles "not interested", and **choose which shelves drive recommendations**. Control over the signal is named repeatedly | **Medium** |
| **The score breakdown / "why this one"** | Charles objects to being *"told what to read on no authority or evidence"* and says an unexplained pick *"puts my back up."* The Substack essay's author wants to *"peek inside the book through the reviewers' eyes"* rather than be scored at | **Medium** |
| **Situation-driven rather than taste-profile** | Roxanne: her reading mood is unpredictable, so *"so much for predictability."* Angel: *"A data source will never be able to get into every single nuance of why you like one thing or another."* Elf: Amazon *"doesn't know me well enough to make my picks for me"* | **Medium** — and this is the core Nidus bet, so it matters that it is only Medium |
| **No model in the request path (DR-008)** | The essay's author reports ChatGPT *"recommends books that don't exist or don't say what it claims they say"* | **Low–Medium** — one source, but it matches the known failure mode |
| **"Your reading order" section** | **No evidence either way.** Nobody in any source asked for a pipeline view. It is a reasonable inference from readers tracking order themselves; it is an inference | **None — assumption** |
| **Shelf-balance warning** | **No evidence either way.** Nobody described wanting to be told their shelf is unbalanced. Plausible, unvalidated, and it is the thing most likely to annoy someone | **None — assumption** |

**Two of the seven changes have no supporting evidence at all**, and both are
the ones built today. That is worth knowing before either is defended.

## 3. The threat the research names clearly

**The preferred alternative is a person, not a better algorithm.**

Across the thread, the most-cited good source is other humans: friends, group
members, and specific critics. Dottie says the people in her reading group are
*"our best source."* Others name the LA Times, the New Yorker, the Washington
Post.

- **Confidence: High** for this segment. It recurs, unprompted, from many
  distinct voices, and nobody argues the other way.
- **Implication:** Nidus's real competitor is not Goodreads or ChatGPT. It is a
  friend with taste. That is already **arm 3 of Experiment 001**, which was
  designed before this research existed — so the experiment is pointed at the
  right rival by luck as much as judgement, and it is worth saying which.

## 4. The first-party finding, which outranks all of the above

From `Nidus_Customer_Discovery_Questions_Feedback_1.docx`, the one real
interview round:

> **"The idea was not understandable until a junior team member explained the
> wider workflow. Nidus therefore has a message-comprehension problem and an
> unproven differentiation claim."**

And the verdict recorded with it: **"A recommendation alone is not a clear
differentiator."**

This is the only evidence here from someone encountering Nidus itself, and it
says the problem is not the algorithm. It is that **nobody understands what
this is.**

**Three independent things now point at the same gap:**

1. The ranker keeps returning *Obviously Awesome* as the next Apply book
2. The shelf-balance lane "saying what it is" computes to **zero**
3. The only real interview says there is a message-comprehension problem

Three signals from three unrelated methods landing on positioning is the
strongest result in this document, and it is about the founder's reading order
as much as the website's copy.

## 5. Sample bias, stated rather than buried

**The proxy readers are not the Nidus audience.** The Goodreads Constant Reader
thread is devoted literary readers, heavily fiction, mostly US, many retired or
reading for pleasure at volume. Nidus is aimed at Indian founders and working
technology professionals reading non-fiction under time pressure.

Those two groups share the mechanics of recommendation and share almost nothing
else — motive, format, budget, time, or what a wasted evening costs them. Every
Medium above should be read as *medium for a group that is not ours.*

**A negative result worth recording:** searching for the same kind of
unfiltered complaint from founders and business-book readers returned almost
nothing but "10 books every entrepreneur should read" listicles. No community
of people describing the pain of choosing a business book was found.

Two readings, and the research cannot distinguish them:

- the pain is real but discussed privately rather than in public forums, **or**
- the pain is low-salience in this segment and the listicle is a sufficient
  answer for most people.

**The second reading is Tiffani's quote applied to our actual market**, and it
is not currently refutable with desk research. It is refutable with eight
readers.

## 6. What we still do not know

| Gap | How to close it | Cost |
|---|---|---|
| Does anyone outside this room prefer a Nidus pick? | **Experiment 001** — pre-registered, unrun | ~2 hours |
| Does the founder segment feel this pain at all? | The first five questions of the Feedback 1 interview guide, run on five people. It already forbids mentioning Nidus until question six | ~3 hours |
| Does the reading-order view get used or ignored? | Cannot be answered without users. Do not defend it until someone has seen it | — |
| Does the balance warning read as useful or as nagging? | Same. Ask it as an open question, never as "do you like this?" | — |
| Is positioning the actual blocker? | It is the one thing three methods agree on. Read *Obviously Awesome* and re-run the Feedback 1 comprehension question | — |

## 7. What this changes

Nothing is being rebuilt on the strength of proxy research, which would be
making the same mistake in a new direction.

1. **The two evidence-free changes stay, labelled as assumptions** — in this
   document and in the code comments, so a later reader does not mistake them
   for validated work.
2. **Positioning moves up.** Three independent signals is as close to a finding
   as this project has produced without users.
3. **Experiment 001 gains a question**, and only one, because it is
   pre-registered and the stop rules may not move: after the blind pick, ask
   *"where did the last book you actually finished come from?"* It is about the
   past, it tests the person-versus-algorithm threat directly, and it cannot
   contaminate the pick because it is asked afterwards.
4. **Nothing here is quoted on the website.** These are other products'
   readers. Putting their words on a Nidus page would be the product claiming
   evidence it does not have — which is the one thing the whole build refuses
   to do.

---

**Sources:** the Goodreads *Constant Reader* discussion on why recommendation
engines fail (verbatims above, ~50 of 59 comments read); *Goodreads and the
Hard Problem of Book Recommendations*, Papyrus Rampant; and
`Nidus_Customer_Discovery_Questions_Feedback_1.docx` and
`Nidus_Feedback_2_Monetisation_and_Distribution_Plan.docx` from this project.
