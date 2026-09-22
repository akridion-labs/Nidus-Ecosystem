/**
 * Seed rows are typed `unknown` on purpose: every row must survive validation
 * in loadCatalogue, including the fixtures at the end that must fail.
 *
 * Facts (works, editions) and editorial inference (profiles) are separate
 * lists with separate provenance. NOTHING here is confirmed against a
 * bibliographic source — every confirmedAt is null and the UI says so.
 */

const DRAFT = { source: 'manual-draft', confirmedAt: null }
const EDITORIAL = { source: 'editorial-draft', confirmedAt: null }

export const seedWorks: unknown[] = [
  { id: 'lean-startup', title: 'The Lean Startup', author: 'Eric Ries', firstPublished: 2011, fiction: false, provenance: DRAFT },
  { id: 'mom-test', title: 'The Mom Test', author: 'Rob Fitzpatrick', firstPublished: 2013, fiction: false, provenance: DRAFT },
  { id: 'hard-thing', title: 'The Hard Thing About Hard Things', author: 'Ben Horowitz', firstPublished: 2014, fiction: false, provenance: DRAFT },
  { id: 'five-rings', title: 'The Book of Five Rings', author: 'Miyamoto Musashi', firstPublished: 1645, fiction: false, provenance: { ...DRAFT, note: 'Public-domain text; translation differs by edition.' } },
  { id: 'bhagavad-gita', title: 'The Bhagavad Gita', author: 'Traditional (translator varies by edition)', firstPublished: null, fiction: false, provenance: { ...DRAFT, note: 'Translation must be chosen before this is shown publicly.' } },
  { id: 'rich-dad', title: 'Rich Dad Poor Dad', author: 'Robert T. Kiyosaki', firstPublished: 1997, fiction: false, provenance: { ...DRAFT, note: 'Widely contested as financial advice. A reading hypothesis, not an endorsement.' } },
  { id: 'deep-work', title: 'Deep Work', author: 'Cal Newport', firstPublished: 2016, fiction: false, provenance: DRAFT },
  { id: 'thinking-fast-slow', title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', firstPublished: 2011, fiction: false, provenance: DRAFT },
  { id: 'man-search-meaning', title: "Man's Search for Meaning", author: 'Viktor E. Frankl', firstPublished: 1946, fiction: false, provenance: DRAFT },
  { id: 'art-of-travel', title: 'The Art of Travel', author: 'Alain de Botton', firstPublished: 2002, fiction: false, provenance: DRAFT },
  { id: 'siddhartha', title: 'Siddhartha', author: 'Hermann Hesse', firstPublished: 1922, fiction: true, provenance: DRAFT },
  { id: 'old-man-sea', title: 'The Old Man and the Sea', author: 'Ernest Hemingway', firstPublished: 1952, fiction: true, provenance: DRAFT },
  { id: 'malgudi-days', title: 'Malgudi Days', author: 'R. K. Narayan', firstPublished: 1943, fiction: true, provenance: DRAFT },
  { id: 'train-to-pakistan', title: 'Train to Pakistan', author: 'Khushwant Singh', firstPublished: 1956, fiction: true, provenance: DRAFT },
  // Fixture: must be rejected (no title).
  { id: 'broken-work', title: '', author: 'Fixture', firstPublished: null, fiction: false, provenance: DRAFT },
]

const ed = (id: string, workId: string, language: string) => ({
  id, workId, language, isbn13: null, format: 'print', pages: null, provenance: DRAFT,
})

export const seedEditions: unknown[] = [
  ed('lean-startup-en', 'lean-startup', 'en'),
  ed('lean-startup-hi', 'lean-startup', 'hi'),
  ed('mom-test-en', 'mom-test', 'en'),
  ed('hard-thing-en', 'hard-thing', 'en'),
  ed('five-rings-en', 'five-rings', 'en'),
  ed('five-rings-hi', 'five-rings', 'hi'),
  ed('bhagavad-gita-en', 'bhagavad-gita', 'en'),
  ed('bhagavad-gita-hi', 'bhagavad-gita', 'hi'),
  ed('bhagavad-gita-te', 'bhagavad-gita', 'te'),
  ed('rich-dad-en', 'rich-dad', 'en'),
  ed('rich-dad-hi', 'rich-dad', 'hi'),
  ed('rich-dad-te', 'rich-dad', 'te'),
  ed('deep-work-en', 'deep-work', 'en'),
  ed('thinking-fast-slow-en', 'thinking-fast-slow', 'en'),
  ed('thinking-fast-slow-hi', 'thinking-fast-slow', 'hi'),
  ed('man-search-meaning-en', 'man-search-meaning', 'en'),
  ed('man-search-meaning-hi', 'man-search-meaning', 'hi'),
  ed('art-of-travel-en', 'art-of-travel', 'en'),
  ed('siddhartha-en', 'siddhartha', 'en'),
  ed('siddhartha-hi', 'siddhartha', 'hi'),
  ed('old-man-sea-en', 'old-man-sea', 'en'),
  ed('malgudi-days-en', 'malgudi-days', 'en'),
  ed('train-to-pakistan-en', 'train-to-pakistan', 'en'),
  ed('train-to-pakistan-hi', 'train-to-pakistan', 'hi'),
  // Fixture: must be rejected (language too short).
  { id: 'broken-edition', workId: 'lean-startup', language: '', isbn13: null, format: 'print', pages: null, provenance: DRAFT },
  // Fixture: must be rejected (points at a work that does not exist).
  ed('orphan-edition', 'no-such-work', 'en'),
]

export const seedProfiles: unknown[] = [
  {
    workId: 'lean-startup',
    inOneLine: 'How to test a business idea in small steps instead of betting everything on one launch.',
    modes: ['apply', 'explore'], topics: ['validation', 'experiments', 'company-building'],
    conceptualDifficulty: 2, typicalSessionMinutes: 15, actionability: 4, emotionalIntensity: 1,
    targetStages: ['EXPLORE', 'VALIDATE'], competencyTags: ['experiment-design', 'customer-learning'],
    prerequisites: [], tooEarlyStages: [], suggestedArtifact: 'One risky assumption written down with the test that would kill it',
    provenance: EDITORIAL,
  },
  {
    workId: 'mom-test',
    inOneLine: 'How to ask people about your idea without them being polite and useless.',
    modes: ['apply'], topics: ['customer-research', 'interviews', 'validation'],
    conceptualDifficulty: 1, typicalSessionMinutes: 10, actionability: 5, emotionalIntensity: 1,
    targetStages: ['EXPLORE', 'VALIDATE'], competencyTags: ['customer-learning'],
    prerequisites: [], tooEarlyStages: [], suggestedArtifact: 'Three customer conversations with no pitching in them',
    provenance: EDITORIAL,
  },
  {
    workId: 'hard-thing',
    inOneLine: 'What running a company feels like when it is going badly, from someone it happened to.',
    modes: ['apply'], topics: ['management', 'crisis', 'company-building'],
    conceptualDifficulty: 3, typicalSessionMinutes: 20, actionability: 3, emotionalIntensity: 3,
    targetStages: ['OPERATE_LEAD', 'SCALE_RENEW'], competencyTags: ['management', 'hard-decisions'],
    prerequisites: ['lean-startup'], tooEarlyStages: ['EXPLORE', 'VALIDATE'],
    suggestedArtifact: 'One hard conversation you have been avoiding, scheduled',
    provenance: { ...EDITORIAL, note: 'Marked premature before there is a team, however good the book is.' },
  },
  {
    workId: 'five-rings',
    inOneLine: 'A swordsman\'s notes on strategy, written in 1645 and still very short.',
    modes: ['explore', 'apply'], topics: ['strategy', 'discipline', 'craft'],
    conceptualDifficulty: 3, typicalSessionMinutes: 10, actionability: 2, emotionalIntensity: 2,
    targetStages: ['EXPLORE', 'STRUCTURE'], competencyTags: ['strategy'],
    prerequisites: [], tooEarlyStages: [], suggestedArtifact: 'One position you will stop defending this week',
    provenance: EDITORIAL,
  },
  {
    workId: 'bhagavad-gita',
    inOneLine: 'A conversation about doing your work when you would rather walk away from it.',
    modes: ['enjoy', 'explore', 'apply'], topics: ['duty', 'composure', 'decision'],
    conceptualDifficulty: 4, typicalSessionMinutes: 10, actionability: 2, emotionalIntensity: 3,
    targetStages: [], competencyTags: [], prerequisites: [], tooEarlyStages: [], suggestedArtifact: null,
    provenance: EDITORIAL,
  },
  {
    workId: 'rich-dad',
    inOneLine: 'A popular, heavily argued-over story about how the author learned to think about money.',
    modes: ['explore'], topics: ['money', 'mindset'],
    conceptualDifficulty: 1, typicalSessionMinutes: 10, actionability: 2, emotionalIntensity: 1,
    targetStages: ['EXPLORE'], competencyTags: [], prerequisites: [], tooEarlyStages: [], suggestedArtifact: null,
    provenance: EDITORIAL,
  },
  {
    workId: 'deep-work',
    inOneLine: 'Why long uninterrupted stretches beat busy days, and how to get them.',
    modes: ['apply', 'explore'], topics: ['focus', 'attention', 'craft'],
    conceptualDifficulty: 2, typicalSessionMinutes: 20, actionability: 4, emotionalIntensity: 1,
    targetStages: [], competencyTags: ['focus'], prerequisites: [], tooEarlyStages: [],
    suggestedArtifact: 'One 90-minute block defended in your calendar',
    provenance: EDITORIAL,
  },
  {
    workId: 'thinking-fast-slow',
    inOneLine: 'The two ways your mind makes decisions, and where each one goes wrong.',
    modes: ['explore'], topics: ['judgement', 'bias', 'decision'],
    conceptualDifficulty: 4, typicalSessionMinutes: 25, actionability: 1, emotionalIntensity: 1,
    targetStages: [], competencyTags: [], prerequisites: [], tooEarlyStages: [], suggestedArtifact: null,
    provenance: EDITORIAL,
  },
  {
    workId: 'man-search-meaning',
    inOneLine: 'A psychiatrist\'s account of surviving the camps, and what kept people going.',
    modes: ['enjoy', 'explore'], topics: ['meaning', 'endurance'],
    conceptualDifficulty: 2, typicalSessionMinutes: 15, actionability: 0, emotionalIntensity: 5,
    targetStages: [], competencyTags: [], prerequisites: [], tooEarlyStages: [], suggestedArtifact: null,
    provenance: { ...EDITORIAL, note: 'Emotionally heavy. Not offered as comfort reading.' },
  },
  {
    workId: 'art-of-travel',
    inOneLine: 'Why journeys rarely feel like the photographs, and how to look at a place properly.',
    modes: ['enjoy', 'explore'], topics: ['curiosity', 'travel', 'attention'],
    conceptualDifficulty: 2, typicalSessionMinutes: 10, actionability: 1, emotionalIntensity: 1,
    targetStages: [], competencyTags: [], prerequisites: [], tooEarlyStages: [], suggestedArtifact: null,
    provenance: EDITORIAL,
  },
  {
    workId: 'siddhartha',
    inOneLine: 'A young man leaves everything behind to work out what a good life is.',
    modes: ['enjoy', 'explore'], topics: ['meaning', 'solitude', 'journey'],
    conceptualDifficulty: 2, typicalSessionMinutes: 10, actionability: 0, emotionalIntensity: 2,
    targetStages: [], competencyTags: [], prerequisites: [], tooEarlyStages: [], suggestedArtifact: null,
    provenance: EDITORIAL,
  },
  {
    workId: 'old-man-sea',
    inOneLine: 'An old fisherman, one enormous fish, and three days alone at sea.',
    modes: ['enjoy'], topics: ['persistence', 'solitude'],
    conceptualDifficulty: 2, typicalSessionMinutes: 10, actionability: 0, emotionalIntensity: 2,
    targetStages: [], competencyTags: [], prerequisites: [], tooEarlyStages: [], suggestedArtifact: null,
    provenance: EDITORIAL,
  },
  {
    workId: 'malgudi-days',
    inOneLine: 'Short stories about ordinary people in a small South Indian town.',
    modes: ['enjoy'], topics: ['short-stories', 'everyday-life', 'india'],
    conceptualDifficulty: 1, typicalSessionMinutes: 5, actionability: 0, emotionalIntensity: 1,
    targetStages: [], competencyTags: [], prerequisites: [], tooEarlyStages: [], suggestedArtifact: null,
    provenance: EDITORIAL,
  },
  {
    workId: 'train-to-pakistan',
    inOneLine: 'A border village during Partition, and the choices the people in it made.',
    modes: ['enjoy', 'explore'], topics: ['history', 'india', 'moral-choice'],
    conceptualDifficulty: 3, typicalSessionMinutes: 20, actionability: 0, emotionalIntensity: 5,
    targetStages: [], competencyTags: [], prerequisites: [], tooEarlyStages: [], suggestedArtifact: null,
    provenance: { ...EDITORIAL, note: 'Contains Partition violence. Not restful reading.' },
  },
  // Fixture: must be rejected (difficulty out of range).
  {
    workId: 'siddhartha', inOneLine: 'Fixture row.', modes: ['enjoy'], topics: [], conceptualDifficulty: 9, typicalSessionMinutes: 10,
    actionability: 0, emotionalIntensity: 0, targetStages: [], competencyTags: [], prerequisites: [],
    tooEarlyStages: [], suggestedArtifact: null, provenance: EDITORIAL,
  },
]

/**
 * Public-domain works are reachable without buying anything; everything else
 * has to be obtained. This is about the reader's route to the book — it is
 * never a claim that a shop nearby has a copy.
 */
export const PUBLIC_DOMAIN_WORKS = ['five-rings', 'bhagavad-gita']
