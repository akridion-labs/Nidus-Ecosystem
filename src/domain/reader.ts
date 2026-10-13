/**
 * Reading the sentence the reader typed.
 *
 * Until this file existed, "the decision in front of you" was read as a
 * boolean — had they typed anything at all — and then quoted back to them
 * verbatim in the explanation. Quoting someone's words back is the cheapest
 * possible impression of having understood them, and it is the one thing this
 * product cannot afford to fake: the whole claim is that it shows its working.
 *
 * WHY THERE IS NO MODEL HERE
 *
 * The obvious 2026 answer is to send the sentence to an LLM. That would be a
 * worse product for this specific job, and the reasons are not ideological:
 *
 *   - It cannot be shown. The arithmetic is the differentiator; a model's
 *     reasoning cannot be rendered as a bar chart the reader can argue with.
 *   - It cannot be corrected. This reader shows exactly what it took from the
 *     sentence and lets the reader delete any of it. That is better feedback
 *     than a chat box, because it is specific.
 *   - It is not free, not instant, and not available offline — and the
 *     subsidised zero-data tier in the strategy document means some readers
 *     have no spare request to spend.
 *
 * See Nidus_Decision_Record_008. A model is welcome in the workshop (drafting
 * catalogue profiles for human review); it is not welcome in the request path.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * No negation, no sarcasm, no grammar. "I do NOT need pricing help" reads as
 * pricing. That is not a bug waiting to be fixed with more regex — it is the
 * reason the UI must show what was read and let the reader strike it out.
 * A parser whose mistakes are visible and removable beats a parser that is
 * right more often and silent.
 */

/**
 * Phrases a founder actually types, mapped to topics the catalogue really
 * uses. Every topic on the right-hand side is asserted by a test to exist on
 * at least one book, so this can never produce a topic that matches nothing.
 *
 * Multi-word phrases are listed before the single words they contain; the
 * matcher takes the longest match, so "talk to customers" does not also fire
 * the bare "customers" rule.
 */
export const PHRASES: Record<string, string[]> = {
  // Money in, and what to charge
  'how much to charge': ['pricing', 'money'],
  'raise the price': ['pricing', 'money'],
  'free tier': ['pricing', 'product'],
  'should i charge': ['pricing', 'money'],
  'charge for': ['pricing', 'money'],
  pricing: ['pricing', 'money'],
  price: ['pricing', 'money'],
  revenue: ['money', 'strategy'],
  runway: ['money', 'finance'],
  'cash flow': ['money', 'finance'],
  cashflow: ['money', 'finance'],
  funding: ['money', 'finance'],
  investor: ['money', 'persuasion'],
  raising: ['money', 'persuasion'],
  profit: ['money', 'finance'],
  margin: ['money', 'finance'],
  salary: ['money'],
  money: ['money'],

  // Who it is for, and whether they want it
  'talk to customers': ['customer-research', 'interviews'],
  'customer interview': ['customer-research', 'interviews'],
  'user research': ['customer-research', 'interviews'],
  'first customer': ['customer-research', 'selling'],
  'nobody is using': ['customer-research', 'validation'],
  'no one is using': ['customer-research', 'validation'],
  'product market fit': ['validation', 'customer-research'],
  'product-market fit': ['validation', 'customer-research'],
  customers: ['customer-research'],
  customer: ['customer-research'],
  users: ['customer-research', 'product'],
  churn: ['customer-research', 'product'],
  retention: ['product', 'habits'],
  feedback: ['feedback', 'customer-research'],
  validate: ['validation', 'experiments'],
  validation: ['validation', 'experiments'],
  experiment: ['experiments', 'validation'],
  'a/b test': ['experiments'],
  mvp: ['validation', 'experiments'],
  pivot: ['strategy', 'validation'],

  // Saying what it is
  positioning: ['positioning', 'marketing'],
  'what we do': ['positioning', 'communication'],
  'explain what': ['positioning', 'communication'],
  messaging: ['positioning', 'marketing'],
  pitch: ['persuasion', 'communication'],
  'cold email': ['selling', 'marketing'],
  'landing page': ['marketing', 'positioning'],
  marketing: ['marketing'],
  branding: ['marketing', 'positioning'],
  launch: ['marketing', 'strategy'],

  // Getting a yes
  'close a deal': ['selling', 'persuasion'],
  'closing deals': ['selling', 'persuasion'],
  negotiate: ['negotiation', 'persuasion'],
  negotiation: ['negotiation', 'persuasion'],
  selling: ['selling', 'persuasion'],
  sales: ['selling', 'persuasion'],
  sell: ['selling', 'persuasion'],
  'say no': ['negotiation', 'composure'],

  // People
  'first hire': ['team', 'management'],
  'hire someone': ['team', 'management'],
  'let someone go': ['management', 'team'],
  'fire someone': ['management', 'team'],
  'difficult conversation': ['management', 'communication'],
  'hard conversation': ['management', 'communication'],
  'my manager': ['management', 'communication'],
  cofounder: ['team', 'company-building'],
  'co-founder': ['team', 'company-building'],
  delegate: ['management', 'systems'],
  hiring: ['team', 'management'],
  manage: ['management'],
  managing: ['management'],
  team: ['team', 'management'],
  leadership: ['management', 'judgement'],

  // Building the thing
  'what to build': ['product', 'validation'],
  'build next': ['product', 'strategy'],
  roadmap: ['product', 'strategy'],
  feature: ['product'],
  product: ['product'],
  design: ['product', 'craft'],
  shipping: ['product', 'craft'],
  ship: ['product', 'craft'],

  // The shape of the company
  'scale up': ['company-building', 'systems'],
  scaling: ['company-building', 'systems'],
  competitor: ['strategy', 'positioning'],
  competition: ['strategy', 'positioning'],
  strategy: ['strategy', 'judgement'],
  'business model': ['strategy', 'money'],
  process: ['systems', 'management'],
  systems: ['systems'],

  // The founder, which is a real category and not a soft one
  'burned out': ['endurance', 'composure'],
  'burnt out': ['endurance', 'composure'],
  burnout: ['endurance', 'composure'],
  overwhelmed: ['composure', 'focus'],
  'cannot focus': ['attention', 'focus'],
  "can't focus": ['attention', 'focus'],
  distracted: ['attention', 'focus'],
  procrastinat: ['discipline', 'habits'],
  'imposter': ['mindset', 'composure'],
  stuck: ['judgement', 'decision'],
  'give up': ['endurance', 'persistence'],
  quitting: ['endurance', 'decision'],
  'quit my job': ['decision', 'endurance'],
  alone: ['solitude', 'endurance'],
  'no mentor': ['judgement', 'company-building'],
  habit: ['habits', 'discipline'],
  discipline: ['discipline', 'habits'],
  decision: ['decision', 'judgement'],
  decide: ['decision', 'judgement'],
  deciding: ['decision', 'judgement'],
}

export type SituationRead = {
  /** Topics to put in the brief. Deduplicated, capped. */
  topics: string[]
  /** What produced each topic, so the UI can show and undo it. */
  matched: { phrase: string; topics: string[] }[]
  /** True when the reader typed something and nothing was understood. */
  unread: boolean
}

/**
 * Four is the cap, and it is not arbitrary: `focusFit` counts topic hits out
 * of a maximum of 2, so beyond about four topics the extra ones cannot change
 * the ranking and only make the "here is what I read" list longer and less
 * honest about what mattered.
 */
const MAX_TOPICS = 4

const PHRASE_LIST = Object.keys(PHRASES).sort((a, b) => b.length - a.length)

export function readSituation(text: string): SituationRead {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9/'-]+/g, ' ')} `
  if (hay.trim() === '') return { topics: [], matched: [], unread: false }

  const matched: { phrase: string; topics: string[] }[] = []
  const taken: [number, number][] = []

  for (const phrase of PHRASE_LIST) {
    const at = hay.indexOf(phrase)
    if (at === -1) continue
    const end = at + phrase.length
    // A longer phrase already claimed this span; do not count the word inside
    // it a second time.
    if (taken.some(([s, e]) => at < e && end > s)) continue
    taken.push([at, end])
    matched.push({ phrase, topics: PHRASES[phrase] })
  }

  const topics: string[] = []
  for (const m of matched) for (const t of m.topics) {
    if (!topics.includes(t) && topics.length < MAX_TOPICS) topics.push(t)
  }

  return { topics, matched, unread: matched.length === 0 }
}

/**
 * The topics that end up in the brief, from what was typed and what was tapped.
 *
 * The cap is load-bearing, not tidiness. `focusFit` scores min(hits, 2) / 2, so
 * once the brief carries seven topics almost every book hits two of them, every
 * card ties at full marks and the focus term stops discriminating — a reader
 * who said MORE about themselves would get a vaguer answer.
 *
 * The sentence goes first because it is the more specific and more recent
 * statement: the aspiration is the direction, the sentence is this week.
 */
export function focusTopics(fromSentence: string[], fromTaps: string[]): string[] {
  return [...new Set([...fromSentence, ...fromTaps])].slice(0, MAX_TOPICS)
}
