/**
 * Books Nidus recommends and does not stock.
 *
 * "We have not got it" and "it does not exist" are different sentences, and a
 * catalogue that can only say the first one quietly teaches readers that its
 * shelves are the world. These rows have no edition, no provenance and no
 * score — they are never ranked and never appear as a recommendation. They
 * exist so the product can point somewhere honest when the right book is not
 * one of its own.
 *
 * Each needs a reason a person wrote. A list of titles is a bibliography; the
 * reason is the only part that is worth anything.
 */
export type WantedBook = {
  title: string
  author: string
  /** Why this one, for whom, right now. */
  why: string
  /** The gap on the reader's shelf that this fills. */
  fills: string
}

export const WANTED: WantedBook[] = [
  {
    title: 'The Mom Test',
    author: 'Rob Fitzpatrick',
    why: 'Teaches one skill: asking about someone’s life instead of your idea, so what you hear is information rather than politeness. About 130 pages.',
    fills: 'Talking to customers',
  },
  {
    title: 'Obviously Awesome',
    author: 'April Dunford',
    why: 'A method for finding the sentence that says what your product is. The "why you and not a chatbot" question is a positioning question, not a feature question.',
    fills: 'Positioning',
  },
  {
    title: 'Monetizing Innovation',
    author: 'Madhavan Ramanujam and Georg Tacke',
    why: 'Argues that you ask about price in the customer conversation, not after launch. Read straight after The Mom Test, because it changes what you ask.',
    fills: 'Pricing',
  },
  {
    title: 'Traction',
    author: 'Gabriel Weinberg and Justin Mares',
    why: 'Nineteen channels and a method for picking one, instead of assuming three because they are visible.',
    fills: 'Choosing a channel',
  },
  {
    title: 'Continuous Discovery Habits',
    author: 'Teresa Torres',
    why: 'The operational week that The Lean Startup leaves as an idea. A habit rather than a framework, which is what someone without a team can actually run.',
    fills: 'Keeping validation going',
  },
  {
    title: 'Financial Intelligence for Entrepreneurs',
    author: 'Karen Berman and Joe Knight',
    why: 'Reading your own profit and loss statement and working out your runway. Different from understanding investing, and the one that closes companies.',
    fills: 'Operating finance',
  },
]

/**
 * Where to look for a book — searches, never stock checks.
 *
 * Every URL here is a SEARCH endpoint, deliberately. A product link needs a
 * specific edition, and no edition in this catalogue has been confirmed
 * against a bibliographic source, so a direct link would be Nidus asserting an
 * ISBN it has never verified. A search cannot be wrong in that way.
 *
 * What is deliberately absent, and must stay absent until a real feed exists:
 * price, delivery estimate, "in stock", and any claim about which of these is
 * cheapest or fastest. Nidus has no retail feed. The ask for "best delivery
 * time" is exactly the stock claim decision record 005 refuses, wearing a
 * different hat.
 *
 * No affiliate tags, no commission, no sponsored ordering. The day any of
 * those appear, the ranking stops being trustworthy and so does everything
 * else on the page.
 */
export function whereToLook(title: string, author: string) {
  const q = encodeURIComponent(`${title} ${author}`)
  return [
    { label: 'Search Amazon.in', href: `https://www.amazon.in/s?k=${q}`, note: 'An online search. Nidus cannot see the price or whether it is in stock.' },
    { label: 'Borrow or read free', href: `https://openlibrary.org/search?q=${q}`, note: 'Open Library. Some titles are borrowable; out-of-copyright ones are free.' },
    { label: 'Find it in a library', href: `https://search.worldcat.org/search?q=${q}`, note: 'WorldCat lists library holdings, which is closer to a real stock answer than anything Nidus has.' },
    { label: 'Look for a shop near you', href: `https://www.google.com/search?q=${encodeURIComponent(`${title} bookshop near me`)}`, note: 'A plain web search. Ringing the shop is still the only way to know.' },
  ]
}
