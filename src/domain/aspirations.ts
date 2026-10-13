import type { Mode, Purpose, FounderStage, ReadingBrief } from './contracts.ts'
import type { CatalogueItem, LoadedCatalogue } from './catalogue.ts'

/**
 * Aspirations — what someone is trying to become, broken into stages.
 *
 * Everything before this answered "what does tonight look like". That is a
 * good question and it is not the one a mentor asks. A mentor asks what you
 * are building, tells you what it actually breaks into, and then says which
 * part you are standing in. The situations stay; this sits above them.
 *
 * Two rules this file holds itself to.
 *
 * 1. **The stages are editorial and say so.** Nobody has measured that
 *    financial literacy precedes judging risk. It is a reasoned order, written
 *    by a person, and the UI calls it "one way to break it down" rather than
 *    "the path". A recommender that presents an invented ladder as a
 *    discovered one is doing the thing this project refuses.
 *
 * 2. **Every aspiration carries what reading cannot do for it.** This is the
 *    load-bearing half. "Financial freedom" especially: Nidus is not a
 *    financial adviser, several books in that part of the catalogue are
 *    heavily contested, and reading about money is not the same activity as
 *    earning or keeping it. An aspiration without that line is a promise.
 */
export type AspirationStage = {
  name: string
  /** What this stage actually is, in a sentence a person would say. */
  means: string
  topics: string[]
  brief: { purpose: Purpose; mode: Mode; sessionMinutes: number; stage?: FounderStage }
}

export type Aspiration = {
  id: string
  /** The tag. Short, lowercase, the way it would be typed. */
  tag: string
  title: string
  /** One line, in the reader's words rather than the product's. */
  means: string
  stages: AspirationStage[]
  /** Never optional. What reading will not do for this. */
  cannotDo: string
}

export const ASPIRATIONS: Aspiration[] = [
  {
    id: 'build-a-company',
    tag: '#buildacompany',
    title: 'Build a company',
    means: 'Something that still exists on the days you stop pushing it.',
    cannotDo:
      'No book has met your customers. Reading can tell you what question to ask and cannot tell you what the answer is — that only comes back from someone who might pay you.',
    stages: [
      {
        name: 'Find out if anyone wants it',
        means: 'Before anything else, whether the problem is real for someone who is not you.',
        topics: ['validation', 'customer-research', 'experiments'],
        brief: { purpose: 'company-building', mode: 'apply', sessionMinutes: 20, stage: 'VALIDATE' },
      },
      {
        name: 'Get one person to pay',
        means: 'The difference between interest and a business is a payment.',
        topics: ['selling', 'persuasion', 'money'],
        brief: { purpose: 'company-building', mode: 'apply', sessionMinutes: 15, stage: 'SELL' },
      },
      {
        name: 'Make it run without you',
        means: 'Turning the thing only you can do into something someone else could.',
        topics: ['systems', 'company-building'],
        brief: { purpose: 'company-building', mode: 'apply', sessionMinutes: 20, stage: 'STRUCTURE' },
      },
      {
        name: 'Lead the people who run it',
        means: 'The part nobody warns you about, which starts the day someone reports to you.',
        topics: ['management', 'team', 'feedback', 'crisis'],
        brief: { purpose: 'company-building', mode: 'apply', sessionMinutes: 20, stage: 'OPERATE_LEAD' },
      },
    ],
  },
  {
    id: 'financial-freedom',
    tag: '#financialfreedom',
    title: 'Money that does not depend on showing up',
    means: 'Enough that a bad month is inconvenient rather than frightening.',
    cannotDo:
      'Nidus does not give financial or investment advice and is not qualified to. Several books in this part of the catalogue are heavily argued with by people who know the subject, and they are shelved as reading hypotheses rather than endorsements. Reading about money is a different activity from earning it, keeping it, or deciding what to do with it — for that, talk to someone licensed.',
    stages: [
      {
        name: 'See how money actually moves',
        means: 'Where it comes from, where it goes, and which of those you control.',
        topics: ['money', 'mindset'],
        brief: { purpose: 'curiosity', mode: 'explore', sessionMinutes: 15 },
      },
      {
        name: 'Judge risk without flinching',
        means: 'Most money decisions are decisions under uncertainty wearing a different hat.',
        topics: ['judgement', 'bias', 'decision'],
        brief: { purpose: 'decision', mode: 'explore', sessionMinutes: 20 },
      },
      {
        name: 'Build something that earns',
        means: 'At some point the money has to come from a thing you made or a thing you own.',
        topics: ['company-building', 'validation', 'selling'],
        brief: { purpose: 'company-building', mode: 'apply', sessionMinutes: 20, stage: 'EXPLORE' },
      },
    ],
  },
  {
    id: 'ship-something',
    tag: '#shipsomething',
    title: 'Get it out of my head',
    means: 'The idea you have been describing for months, in somebody’s hands.',
    cannotDo:
      'Reading is the most comfortable way to not ship. If you finish a book this week and ship nothing, the book was the problem.',
    stages: [
      {
        name: 'Make it smaller',
        means: 'The version that could exist by Friday, not the one in your head.',
        topics: ['validation', 'experiments', 'company-building'],
        brief: { purpose: 'company-building', mode: 'apply', sessionMinutes: 15, stage: 'EXPLORE' },
      },
      {
        name: 'Put it in front of someone',
        means: 'One person who is not your friend, watching you not explain it.',
        topics: ['customer-research', 'validation'],
        brief: { purpose: 'company-building', mode: 'apply', sessionMinutes: 15, stage: 'VALIDATE' },
      },
    ],
  },
  {
    id: 'lead-people',
    tag: '#leadpeople',
    title: 'Lead people well',
    means: 'Being the manager you would have wanted two jobs ago.',
    cannotDo:
      'Every book here is about a conversation you have to have in person. None of them can have it for you, and reading a fourth one is a way of postponing the first.',
    stages: [
      {
        name: 'Say the true thing, kindly',
        means: 'Most management failure is a sentence somebody did not say.',
        topics: ['feedback', 'management'],
        brief: { purpose: 'company-building', mode: 'apply', sessionMinutes: 20, stage: 'OPERATE_LEAD' },
      },
      {
        name: 'Build a team that argues well',
        means: 'Disagreement is the work. Silence is the warning sign.',
        topics: ['team', 'management'],
        brief: { purpose: 'company-building', mode: 'apply', sessionMinutes: 20, stage: 'OPERATE_LEAD' },
      },
      {
        name: 'Decide when it is hard',
        means: 'The decisions with no good option, which are the ones you are paid for.',
        topics: ['crisis', 'decision', 'judgement'],
        brief: { purpose: 'decision', mode: 'apply', sessionMinutes: 20, stage: 'OPERATE_LEAD' },
      },
    ],
  },
  {
    id: 'think-clearly',
    tag: '#thinkclearly',
    title: 'Think more clearly',
    means: 'Fewer decisions, made better, and less noise in between.',
    cannotDo:
      'Knowing the name of a bias does not stop you having it. These books are a vocabulary for noticing, not a cure.',
    stages: [
      {
        name: 'Catch yourself',
        means: 'The ways your own mind takes shortcuts, with their names.',
        topics: ['bias', 'judgement'],
        brief: { purpose: 'curiosity', mode: 'explore', sessionMinutes: 25 },
      },
      {
        name: 'Choose under uncertainty',
        means: 'Deciding well when you cannot know, which is most of the time.',
        topics: ['decision', 'strategy', 'judgement'],
        brief: { purpose: 'decision', mode: 'explore', sessionMinutes: 20 },
      },
      {
        name: 'Keep your head',
        means: 'The oldest part of this, and the part that does not date.',
        topics: ['composure', 'duty', 'meaning'],
        brief: { purpose: 'decision', mode: 'enjoy', sessionMinutes: 10 },
      },
    ],
  },
  {
    id: 'attention-back',
    tag: '#getmyattentionback',
    title: 'Get my attention back',
    means: 'Being able to sit with one thing for an hour again.',
    cannotDo:
      'Nidus is a website. It is asking for the same attention everything else is asking for, and the honest version of this goal ends with you closing the tab.',
    stages: [
      {
        name: 'Rebuild the muscle',
        means: 'Long stretches, defended, until they stop feeling difficult.',
        topics: ['focus', 'attention', 'discipline'],
        brief: { purpose: 'craft', mode: 'apply', sessionMinutes: 30 },
      },
      {
        name: 'Put something there instead',
        means: 'An empty hour fills itself with the thing you were avoiding.',
        topics: ['solitude', 'short-stories', 'journey', 'everyday-life'],
        brief: { purpose: 'unwind', mode: 'enjoy', sessionMinutes: 20 },
      },
    ],
  },
]

export type StagePlan = {
  stage: AspirationStage
  books: CatalogueItem[]
  finished: number
  /** True for the first stage with unfinished books — where the reader stands. */
  youAreHere: boolean
}

/**
 * Where the reader stands on an aspiration, from what they have finished.
 *
 * "You are here" is the first stage with anything left in it. That is a
 * deliberately crude rule and it is better than the alternatives: inferring a
 * stage from behaviour would be a guess dressed as a measurement, and asking
 * would be another form to fill in.
 */
export function aspirationPlan(
  catalogue: LoadedCatalogue,
  aspiration: Aspiration,
  brief: ReadingBrief,
): StagePlan[] {
  const done = new Set(
    brief.intents.filter((i) => i.status === 'COMPLETED').map((i) => i.workId),
  )
  let marked = false
  return aspiration.stages.map((stage) => {
    const books = catalogue.items.filter((i) =>
      i.profile.topics.some((t) => stage.topics.includes(t)),
    )
    const finished = books.filter((b) => done.has(b.work.id)).length
    const here = !marked && finished < books.length
    if (here) marked = true
    return { stage, books, finished, youAreHere: here }
  })
}
