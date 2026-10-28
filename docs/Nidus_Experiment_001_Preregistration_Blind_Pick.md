# Experiment 001 — pre-registration: the blind pick

**Written 28 October 2026, before any reader has been contacted and before any
data exists.** That order is the only thing that makes this document worth
anything. Committed to git on the day it was written so the timestamp is not
mine to move.

The thresholds below are computed by `nidus-pilot/tools/experiment-power.mjs`,
not chosen. Run it; it prints the whole table.

---

## 1. The claim on trial

Nidus's one claim, stripped of everything else, is:

> Given a reader's actual situation, Nidus names a better next book than the
> places that reader would otherwise look.

Everything built so far — the sentence reader, the two-stage ranker, the 91-work
catalogue, the shape gates, the score bars — exists to serve that sentence. If
it is false, none of it matters and the honest move is to stop.

**It has never been tested on anyone but me.** That has been item 0 on the
roadmap for eight working sessions. This is the test.

## 2. Why not just ask people

Because that measures the wrong thing and I already know it does. The question
"would you use an app that recommends books?" produces a yes from almost
everyone and predicts nothing, which is the specific failure *The Mom Test*
exists to prevent — and it is the book sitting on my desk waiting to be read.
So:

- **No one is asked whether they like Nidus.** No one is told Nidus is involved.
- **No one is asked to rate anything.** They make one choice between six titles.
- **The thing measured is a choice, not an opinion.**

## 3. Design

A **within-reader blind forced choice**. Each reader sees six candidate titles
for their own stated situation and picks the one they would start tonight.

Within-reader rather than between-reader for an unglamorous reason: with eight
people, splitting them across arms leaves one or two per arm and measures
nothing. Each reader comparing all six arms against their own situation gets
eight comparisons out of eight people.

### The six arms

| # | Arm | Where the title comes from | What it controls for |
|---|---|---|---|
| 1 | **Nidus** | The top-ranked book from the live ranker, given the reader's situation | the thing being tested |
| 2 | **Bestseller** | Top business/self-help title on a named Indian retailer's bestseller list that week | "a list would have told me the same" |
| 3 | **A person** | A book a friend or colleague of the reader recommends for the same situation, collected independently | "I'd just ask someone" |
| 4 | **Chatbot** | ChatGPT, given the reader's situation in their own words, free tier, one shot, no follow-up | the objection the strategy doc has been answering in prose since September |
| 5 | **Random from the same catalogue** | Uniform draw from the 91 works, ignoring the ranker entirely | **the ranker itself** |
| 6 | **Sabotage** | A catalogue book that fails one of the reader's own stated gates — a shape they excluded, or a prerequisite they have not read | **the instrument** |

Arms 5 and 6 are the two that make this an experiment rather than a demo.

**Arm 5 is the one I am afraid of.** If a random draw from the Nidus catalogue
is picked as often as the ranker's choice, then every scoring decision, every
eligibility gate and every weight is contributing nothing, and what Nidus
actually has is a good shelf with an expensive front end. That finding would be
worth more than a win, and it is cheap to get, so it goes in.

**Arm 6 checks whether anyone is reading the list at all.** A reader who said
"no relationship drama" and picks a relationship drama is clicking at random,
and their row cannot be used as evidence of anything.

### What a reader does

1. Describes one real, current situation in their own words, in writing, before
   seeing anything. This text is what all six arms are generated from, verbatim.
2. For arms 1, 4, 5 and 6: generated from that text. For arm 2: that week's
   list. For arm 3: a person the reader names, asked by me, who never sees the
   other five.
3. The six are shown as **bare titles and authors, in random order** — no
   covers, no blurbs, no scores, no explanations, no mention of where any came
   from.
4. One pick: *which of these would you start tonight?*
5. Nothing else. No rating scale, no follow-up questions in the same sitting.

### Blinding, and the part I cannot blind

The reader is blinded to the source of every title. That part is clean.

**I am not blinded, and I am also the one recruiting.** A solo founder cannot
run a double-blind trial on his own product, and pretending otherwise would be
worse than naming it. Three mitigations, all of which cost nothing:

- The six titles are **generated and written down before the reader is
  contacted**, so I cannot adjust the Nidus pick after hearing them talk.
- The pick is collected **by form, not in conversation**, so there is no tone of
  voice to lean on.
- **I do not look at any pick until all eight are in.** No peeking, because
  peeking plus a stopping decision is how an underpowered run becomes whatever
  the runner wanted.

## 4. Who, and how many

**Eight readers.** Not because eight is enough — section 6 is explicit that it
is not — but because eight is what can be recruited this month without spending
money, and an underpowered test that happens beats a well-powered one that stays
on a roadmap.

Eligibility: an adult who has read at least one non-fiction book in the past
year and is not me. **No more than two from any single source** — not eight
friends, not eight people from one WhatsApp group. Friends and family will
flatter the result, so the rule caps how much they can.

Recorded before the run: where each reader came from, and their relationship to
me. If six of eight turn out to be people who like me, that goes in the writeup
next to the number.

## 5. Outcomes

**Primary:** the count of readers, out of eight, whose blind pick was the Nidus
title.

**Secondary, collected at day 14 and not used for any comparison:** of the
readers who obtained their picked book, how many got past chapter two. This
cannot compare arms — only one book per reader gets read — but it answers a
different question that matters: whether a well-chosen book gets *started* at
all, or whether the problem was never selection.

An honesty check on the secondary, because self-reported reading is
self-flattering: readers are asked to say one specific thing the book argues,
not how far they got.

**Nothing else is collected.** No satisfaction score, no NPS, no "how likely are
you to recommend". Those are the outputs I would be tempted to quote if the real
number disappointed, so they do not exist.

## 6. Thresholds, fixed now

Under the null — six arms, no arm more appealing than any other — each pick is a
draw with probability 1/6. Exact binomial, from `tools/experiment-power.mjs`:

| Nidus picks | P(at least this many) under the null | Reading |
|---|---|---|
| 8 of 8 | 0.0000 | — |
| 6 of 8 | 0.0004 | — |
| **5 of 8** | **0.0046** | clears 0.05 comfortably |
| **4 of 8** | **0.0307** | **the pre-registered threshold** |
| 3 of 8 | 0.1348 | noise |
| 2 of 8 | 0.3953 | noise |
| 1 of 8 | 0.7674 | at or below chance |

**Threshold: 4 of 8.**

### And the other half, which is the part that usually goes missing

If the premise were *true* — Nidus genuinely picked half the time against five
rivals — eight readers would reach 4 of 8 only **64%** of the time. So:

- **4 or more:** worth continuing. **Not proof.** One run of eight people at
  p = 0.03 is a reason to run twenty-four, not a reason to tell anyone Nidus
  works.
- **2 or 3:** settles nothing in either direction. This result must **not** be
  written up as a loss, and must not be written up as encouraging. It means the
  instrument was too small, which was known in advance.
- **0 or 1:** decisive against the premise. If Nidus really were picked half the
  time, eight readers would hand it 0 or 1 pick just **3.5%** of the time.

So this run is a **tripwire, not a measurement**. It is designed to catch a
premise that is badly wrong, cheaply and fast. It cannot confirm one that is
right. Written here so that in three weeks I cannot promote a 4-of-8 into
validation.

### The two rules that fire regardless of the Nidus count

1. **If arm 5 (random from the same catalogue) ties or beats arm 1, stop
   building the ranker.** Ship the catalogue as a browsable shelf with the
   honesty copy, and spend the saved effort on the catalogue instead. This fires
   even on an otherwise good result: Nidus 4, random 4 is not a win, it is a
   finding that the 91 books are doing the work.
2. **If arm 6 (sabotage) is picked by 2 or more of 8, the run is void.** Readers
   are not reading the list. Fix the instrument and re-run; do not interpret the
   rest.

### Stop rule

Eight readers, then stop and look. **No peeking, no extending to nine because
eight looked promising, no dropping a reader whose pick was inconvenient.** If a
reader drops out, they are replaced and both facts are reported.

## 7. What would show the result is right, other than me

- **This document, timestamped before the data.** The thresholds cannot be moved
  afterwards because they are in a commit.
- **The script, not my arithmetic.** `tools/experiment-power.mjs` prints the full
  table; anyone can run it and get the same thresholds.
- **The two negative controls.** Arm 5 can falsify the ranker, arm 6 can falsify
  the instrument. A test with nothing that can fail is not a test.
- **The raw rows published with the writeup**: each reader's situation text, the
  six titles, the random order shown, the pick, and the source of each reader.
  Eight rows fit on one screen, so there is nowhere for a selective summary to
  hide.
- **Pre-registered refusal:** no new outcome measure may be added after the data
  is seen. If a better measure occurs to me mid-run, it goes in Experiment 002.

## 8. Cost, and why there is no excuse

Money: nothing. The six titles cost nothing to generate. Arm 3 is a question
asked by message. Nobody is paid. The secondary outcome only follows the book
the reader chose, which they buy or borrow as they would anyway — and if nobody
is willing to obtain a single book they picked themselves, that is a finding too.

Time: about two hours of mine, plus roughly ten minutes per reader.

The real cost is that it can kill eight sessions of building, which is exactly
why it keeps not happening, and exactly why it is next.

## 9. What this does not test

- **Whether anyone would pay.** Nothing here touches money.
- **Whether Nidus is better than a chatbot that remembers you.** Arm 4 is one
  shot on a free tier. A chatbot with memory of a reader's last ten books is a
  different and stronger rival, and DR-008 already names memory rather than
  intelligence as the market's real complaint.
- **Retention, habit, or any of the loop.** One pick, one follow-up.
- **The subsidised tier, the physical rings, the train logistics.** None of it.
- **India specifically, with n = 8.** Eight people are eight people.

A test that tested all of that would not be running this month, which is the
whole argument for this one.
