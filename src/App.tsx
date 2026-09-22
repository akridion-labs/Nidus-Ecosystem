import { useMemo, useState } from 'react'
import {
  ReadingBrief, MODES, PURPOSES, FOUNDER_STAGES, REJECTION_REASONS,
  FORMAT_PREFS, BUDGETS,
} from './domain/contracts.ts'
import type {
  AccessRoute, Budget, FormatPreference, FounderStage, Mode, Purpose,
  RecommendationDecision, RejectionReason, ResultRole, ReadingBrief as Brief,
} from './domain/contracts.ts'
import { catalogue } from './data/catalogue.ts'
import { Wordmark } from './brand/Wordmark.tsx'
import { authorsIn } from './domain/catalogue.ts'
import { rank } from './domain/ranker.ts'
import { SHELVES, shelfItems } from './domain/shelves.ts'
import type { Shelf } from './domain/shelves.ts'
import type { CoverageGap, Ineligible } from './domain/ranker.ts'

/* ---------------------------------------------------------------- *
 * Copy. Wording comes from the UI brief and the wireframe, not from
 * whatever sounded good while writing the component.
 * ---------------------------------------------------------------- */

const PURPOSE_COPY: Record<Purpose, string> = {
  unwind: 'Unwind',
  curiosity: 'Follow a curiosity',
  craft: 'Get better at my craft',
  decision: 'Think through a decision',
  'company-building': 'Build something',
}

const MODE_COPY: Record<Mode, { label: string; sub: string }> = {
  enjoy: { label: 'Enjoy', sub: 'Not homework' },
  explore: { label: 'Explore', sub: 'Follow a thread' },
  apply: { label: 'Apply', sub: 'Act on it' },
}

const STAGE_COPY: Record<FounderStage, string> = {
  EXPLORE: 'Exploring',
  VALIDATE: 'Validating',
  STRUCTURE: 'Structuring',
  SELL: 'Selling',
  OPERATE_LEAD: 'Operating and leading',
  SCALE_RENEW: 'Scaling and renewing',
}

const FORMAT_COPY: Record<FormatPreference, { label: string; sub?: string }> = {
  any: { label: 'Any', sub: 'Whatever exists' },
  print: { label: 'Print' },
  ebook: { label: 'Ebook' },
  audio: { label: 'Audiobook' },
}

const BUDGET_COPY: Record<Budget, { label: string; sub: string }> = {
  any: { label: 'I can buy a book', sub: 'No limit on the route' },
  'free-only': { label: 'Free only', sub: 'My shelf, or out of copyright' },
}

const LANGUAGES = [
  { tag: 'en', label: 'English' },
  { tag: 'hi', label: 'हिंदी' },
  { tag: 'te', label: 'తెలుగు' },
  { tag: 'ta', label: 'தமிழ்' },
]

const SESSIONS = [10, 20, 30, 45]

const REJECTION_COPY: Record<RejectionReason, string> = {
  'already-read': 'Already read it',
  'wrong-language': 'Wrong language',
  unavailable: 'I cannot get it',
  'too-difficult': 'Too difficult',
  repetitive: 'Repetitive',
  'not-relevant': 'Not relevant to me',
  unappealing: 'Just does not appeal',
}

const ACCESS_COPY: Record<AccessRoute, string> = {
  'on-your-shelf': 'On your shelf',
  'public-domain': 'Free to read',
  'to-obtain': 'You would need a copy',
}

const ROLE_COPY: Record<ResultRole, string> = {
  'strongest-fit': 'Closest fit',
  'adjacent-fit': 'Near it',
  exploration: 'A different direction',
}

const USAGE_COPY: Record<RecommendationDecision['recommendedUsage'], string> = {
  FULL_READ: 'Read it through',
  SELECTED_CHAPTERS: 'Selected chapters only',
  WORKBOOK_REFERENCE: 'Keep as a reference',
  DEFER: 'Not yet',
}

/* ---------------------------------------------------------------- *
 * The cold open.
 *
 * The page used to begin with a form: seven fieldsets of cost before a single
 * thing was given. Nobody is curious about a form. It begins instead with a
 * situation, and the only question is whether it is yours.
 *
 * These are NOT quotations. Nothing from a book appears here — a recommender
 * that opens by reprinting someone else's paragraph has a copyright problem
 * and, worse, is borrowing the interest instead of earning it. Each line
 * describes the READER. Recognition is the hook; the book is the payoff.
 *
 * Each opening is a real brief. Tapping one fills the form in front of you,
 * which is the moment the product explains itself: you can see your evening
 * being turned into a purpose, a mode and a number of minutes.
 */
type Opening = {
  id: string
  line: string
  short: string
  brief: {
    purpose: Purpose; mode: Mode; sessionMinutes: number
    stage?: FounderStage; activeApplyBooks?: number
  }
}

const OPENINGS: Opening[] = [
  {
    id: 'decision',
    line: 'It is 11:40pm. You have twenty minutes, and a decision you have been avoiding for nine days.',
    short: 'A decision you keep avoiding',
    brief: { purpose: 'decision', mode: 'apply', sessionMinutes: 20 },
  },
  {
    id: 'no-one-paid',
    line: 'Three people told you they loved it. Nobody has paid you yet.',
    short: 'Everyone loves it, nobody pays',
    brief: { purpose: 'company-building', mode: 'apply', sessionMinutes: 20, stage: 'VALIDATE' },
  },
  {
    id: 'phone-won',
    line: 'You have read four pages in two weeks. Your phone has read thousands.',
    short: 'The phone is winning',
    brief: { purpose: 'unwind', mode: 'enjoy', sessionMinutes: 10 },
  },
  {
    id: 'train',
    line: 'The train is forty minutes late and there is no signal on this platform.',
    short: 'Forty minutes, no signal',
    brief: { purpose: 'curiosity', mode: 'explore', sessionMinutes: 45 },
  },
  {
    id: 'managing',
    line: 'You have been managing people for two months and nobody warned you what it would feel like.',
    short: 'Two months of managing people',
    brief: { purpose: 'company-building', mode: 'apply', sessionMinutes: 20, stage: 'OPERATE_LEAD' },
  },
  {
    id: 'same-tab',
    line: 'You keep opening the same tab instead of doing the work.',
    short: 'Opening the same tab again',
    brief: { purpose: 'craft', mode: 'apply', sessionMinutes: 30 },
  },
]

function Shelves({ onPick }: { onPick: (shelf: Shelf) => void }) {
  const [openId, setOpenId] = useState(SHELVES[0].id)
  const shelf = SHELVES.find((x) => x.id === openId)!
  const books = shelfItems(catalogue, shelf)

  return (
    <section aria-labelledby="shelves" className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="shelves" className="display text-[2rem]">The shelves</h2>
        <p className="max-w-[46ch] text-[15px] text-muted">
          Somewhere to wander rather than a question to answer. A shelf shows what is here; it is
          not a recommendation, and the arithmetic still decides what fits tonight.
        </p>
      </div>

      {/* Index tabs, like the dividers in a card catalogue. */}
      <div role="tablist" aria-label="Shelves" className="mt-6 flex flex-wrap gap-2">
        {SHELVES.map((x) => {
          const count = shelfItems(catalogue, x).length
          const on = x.id === openId
          return (
            <button
              key={x.id}
              role="tab"
              aria-selected={on}
              type="button"
              onClick={() => setOpenId(x.id)}
              className={[
                'transition-ui flex min-h-11 items-center gap-2 rounded-t-xl border px-4 text-[15px]',
                on
                  ? 'border-line border-b-surface bg-surface text-ink'
                  : 'border-transparent bg-paper text-muted hover:text-ink',
              ].join(' ')}
            >
              {x.name}
              <span className={count === 0 ? 'label-caps text-amber' : 'label-caps text-accent'}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div key={shelf.id} className="shelf-in rounded-2xl rounded-tl-none border border-line bg-surface p-5 sm:p-8">
        <p className="book-voice max-w-[34ch] text-[1.5rem]">{shelf.note}</p>

        {books.length === 0 ? (
          <div className="mt-6 rounded-xl border border-amber bg-amber-soft p-5">
            <p className="font-medium">This shelf is empty, and that is the truth rather than a placeholder.</p>
            <p className="mt-2 max-w-[58ch] text-[15px] text-muted">
              There is no science fiction in the Nidus catalogue at all — not one title. Filling this
              shelf is not a switch to flip: each book needs an editorial profile written by a person
              who has read it, an edition confirmed against a bibliographic source, and a plain
              sentence saying what it is. Until that happens, an empty shelf is the honest answer and
              a “coming soon” badge would not be.
            </p>
          </div>
        ) : (
          <>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {books.map((item) => (
                <li
                  key={item.work.id}
                  className="mount rounded-xl border border-line bg-paper p-4"
                >
                  <p className="book-voice text-[1.25rem]">{item.work.title}</p>
                  <p className="text-[14px] text-muted">
                    {item.work.author}
                    {item.work.firstPublished !== null && ` · ${item.work.firstPublished}`}
                  </p>
                  <p className="mt-2 text-[15px] leading-snug">{item.profile.inOneLine}</p>
                  <p className="label-caps mt-3 text-muted">
                    {item.profile.topics.filter((t) => shelf.topics.includes(t)).join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => onPick(shelf)}
              className="transition-ui mt-6 min-h-12 rounded-xl bg-accent px-6 text-[16px] font-semibold text-surface hover:opacity-90 active:scale-[0.98]"
            >
              Pick tonight&rsquo;s book from this shelf
            </button>
            <p className="mt-2 max-w-[54ch] text-[14px] text-muted">
              Runs the same ranking as everything else, so it may hand you a book you were not
              looking at — or rule out every one of these and say so.
            </p>
          </>
        )}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- *
 * Primitives
 * ---------------------------------------------------------------- */

function Field({
  legend, hint, children, layout = 'wrap',
}: { legend: string; hint?: string; children: React.ReactNode; layout?: 'wrap' | 'grid' }) {
  return (
    <fieldset className="mb-7 border-0 p-0">
      <legend className="label-caps mb-1 text-muted">{legend}</legend>
      {hint && <p className="mb-3 max-w-[60ch] text-[15px] text-muted">{hint}</p>}
      <div className={layout === 'grid' ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>{children}</div>
    </fieldset>
  )
}

/* 44px minimum target, per the brief. */
function Choice<T extends string | number>({
  name, value, current, label, sub, onChange,
}: { name: string; value: T; current: T; label: string; sub?: string; onChange: (v: T) => void }) {
  const selected = current === value
  return (
    <label
      className={[
        'transition-ui flex min-h-11 cursor-pointer flex-col justify-center rounded-xl border px-4 py-2',
        selected
          ? 'border-accent bg-accent-soft text-ink'
          : 'border-line bg-surface text-muted hover:border-accent hover:text-ink',
      ].join(' ')}
    >
      <input type="radio" name={name} className="sr-only" checked={selected} onChange={() => onChange(value)} />
      <span className="text-[16px] font-medium">{label}</span>
      {sub && <span className="text-[14px] leading-snug text-muted">{sub}</span>}
    </label>
  )
}

/**
 * The trace — a librarian going to the shelves and coming back.
 *
 * The brief asks for a visible step-by-step mapping from the reader's
 * situation to the books, and the temptation is a spinner that counts to 100
 * while nothing happens. This does the opposite: it NAMES the books it is
 * putting back and says why, because that is information the reader could not
 * get anywhere else and it happens to look exactly like someone working.
 *
 * The single rule: every line is a fact from the ranking that just ran. The
 * titles are real, the reasons are the real eligibility failures, the counts
 * are real. Nothing here is padded to make the wait feel longer — the ranking
 * takes about 0.04ms, and the animation is there so a person can follow a
 * decision that would otherwise be instantaneous and invisible.
 */
function Trace({ total, excluded, purpose, mode, minutes, scored }: {
  total: number
  excluded: Ineligible[]
  purpose: string
  mode: string
  minutes: number
  scored: number
}) {
  // Four books, named, with the actual reason each was put back. Cap at four
  // because the point is "you can see it happening", not "read this list".
  const shown = excluded.slice(0, 4)
  const rest = excluded.length - shown.length

  return (
    <div className="mb-6 rounded-2xl border border-line bg-surface/70 p-4">
      <p className="label-caps flex items-center gap-2 text-muted">
        <span className="dot-pulse" aria-hidden /> Checking the shelves
      </p>

      <ol className="mt-3 space-y-2">
        <li className="rise text-[15px]" style={{ animationDelay: '0ms' }}>
          Read your situation — <span className="text-muted">{purpose} · {mode} · {minutes} min</span>
        </li>
        <li className="rise text-[15px]" style={{ animationDelay: '260ms' }}>
          Took {total} books off the shelf.
        </li>
        {shown.map((x, i) => (
          <li
            key={x.item.work.id}
            className="rise flex gap-2 text-[14px] text-muted line-through decoration-line"
            style={{ animationDelay: `${420 + i * 130}ms` }}
          >
            <span aria-hidden>—</span>
            <span className="no-underline">
              Put back <span className="text-ink">{x.item.work.title}</span>: {x.reason}.
            </span>
          </li>
        ))}
        {rest > 0 && (
          <li
            className="rise text-[14px] text-muted"
            style={{ animationDelay: `${420 + shown.length * 130}ms` }}
          >
            …and {rest} more, for reasons you can ask about.
          </li>
        )}
        <li
          className="rise text-[15px] font-medium"
          style={{ animationDelay: `${520 + shown.length * 130}ms` }}
        >
          Carried {scored} to the desk. Scoring them now.
        </li>
      </ol>
    </div>
  )
}

/**
 * The signature moment: the arithmetic, performed.
 *
 * This is the one thing Nidus does that a chatbot structurally cannot, so it
 * is the one thing that must not be hidden behind a disclosure. Two facts are
 * encoded, and both are honest rather than decorative:
 *
 *   track length  = how much this signal is WORTH (maxPoints, to scale)
 *   fill          = how much this book EARNED of it
 *
 * So a short full bar and a long half-empty one read differently at a glance,
 * which is exactly the difference they represent. The fill animates because
 * the sum is being worked out in front of you, and it lands on a number
 * printed beside it — if the animation ever disagreed with the number, the
 * number is what is true.
 */
function Reasoning({
  components, score, branch, rankerVersion, catalogueVersion,
}: Pick<RecommendationDecision,
  'components' | 'score' | 'branch' | 'rankerVersion' | 'catalogueVersion'>) {
  const widest = Math.max(...components.map((c) => c.maxPoints))
  return (
    <div className="mt-6 border-t border-line pt-5">
      <p className="label-caps text-muted">The arithmetic</p>
      <ul className="mt-4 space-y-4">
        {components.map((c, i) => {
          const penalty = c.points < 0
          const earned = Math.abs(c.points) / c.maxPoints
          return (
            <li key={c.signal}>
              <div className="flex items-baseline justify-between gap-4">
                {/* Signal names arrive as kebab-case from one branch and camelCase
                    from the other, so both are split — "timeDifficulty" read as
                    TIMEDIFFICULTY in the first build. */}
                <span className="label-caps text-ink">
                  {c.signal.replace(/-/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')}
                </span>
                <span className="text-[15px] font-medium tabular-nums whitespace-nowrap">
                  {c.points > 0 ? '+' : ''}{c.points}
                  <span className="text-muted"> / {c.maxPoints}</span>
                </span>
              </div>
              <div
                className="mt-2 h-[5px] rounded-full bg-line"
                style={{ width: `${(c.maxPoints / widest) * 100}%` }}
              >
                <div
                  className={`bar-fill h-full rounded-full ${penalty ? 'bg-amber' : 'bg-accent'}`}
                  style={{ width: `${earned * 100}%`, animationDelay: `${140 + i * 70}ms` }}
                />
              </div>
              <p className="mt-2 max-w-[54ch] text-[14px] leading-snug text-muted">{c.text}</p>
            </li>
          )
        })}
      </ul>
      <p className="mt-5 max-w-[54ch] text-[14px] text-muted">
        <span className="text-[17px] font-semibold text-ink tabular-nums">{score}</span> out of 100 on
        the {branch} ranker. A rule total, not a prediction that the book will work for you.
        Popularity and sales figures move none of it. Ranker {rankerVersion}, catalogue {catalogueVersion}.
      </p>
    </div>
  )
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'amber' }) {
  return (
    <span
      className={[
        'label-caps inline-flex items-center rounded-md px-2 py-1',
        tone === 'amber' ? 'bg-amber-soft text-amber' : 'bg-accent-soft text-accent',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------- *
 * App
 * ---------------------------------------------------------------- */

export default function App() {
  const [purpose, setPurpose] = useState<Purpose>('company-building')
  const [mode, setMode] = useState<Mode>('apply')
  const [language, setLanguage] = useState('en')
  const [sessionMinutes, setSessionMinutes] = useState(20)
  const [formatPreference, setFormatPreference] = useState<FormatPreference>('any')
  const [budget, setBudget] = useState<Budget>('any')
  const [author, setAuthor] = useState<string | null>(null)

  // Founder context is asked only when entrepreneurship is the purpose, and
  // every field is user-confirmed. Nothing here is inferred.
  const [stage, setStage] = useState<FounderStage>('VALIDATE')
  const [currentDecision, setCurrentDecision] = useState('')
  const [activeApplyBooks, setActiveApplyBooks] = useState(0)

  const [rejections, setRejections] = useState<{ workId: string; reason: RejectionReason }[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  // One book at a time. The feedback was explicit: a stack of three cards reads
  // as a bundle to get through, not as an answer to the question asked.
  const [revealed, setRevealed] = useState(1)

  const [openingId, setOpeningId] = useState(OPENINGS[0].id)
  // Bumped on every answer so the trace and the arithmetic replay rather than
  // silently swapping to new values.
  const [runId, setRunId] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  // Books the reader has taken. This is the memory claim, honestly scoped:
  // it lasts until reload, and the page says so rather than implying more.
  const [taken, setTaken] = useState<string[]>([])

  const opening = OPENINGS.find((o) => o.id === openingId)!

  function answer() {
    setShown(true)
    setRevealed(1)
    setRunId((n) => n + 1)
  }

  function applyShelf(shelf: Shelf) {
    setPurpose(shelf.brief.purpose)
    setMode(shelf.brief.mode)
    setSessionMinutes(shelf.brief.sessionMinutes)
    setAuthor(null)
    answer()
    document.getElementById('results')?.scrollIntoView({ block: 'start' })
  }

  function applyOpening(o: Opening) {
    setOpeningId(o.id)
    setPurpose(o.brief.purpose)
    setMode(o.brief.mode)
    setSessionMinutes(o.brief.sessionMinutes)
    if (o.brief.stage) setStage(o.brief.stage)
    setActiveApplyBooks(o.brief.activeApplyBooks ?? 0)
    setAuthor(null)
    answer()
  }

  const asksFounder = purpose === 'company-building'

  const brief: Brief = useMemo(
    () =>
      ReadingBrief.parse({
        purpose, mode, language, sessionMinutes, formatPreference, budget, author,
        adultConfirmed: true,
        founderContext: asksFounder ? { stage, currentDecision, actionHoursPerWeek: 2, activeApplyBooks } : null,
        rejections,
      }),
    [purpose, mode, language, sessionMinutes, formatPreference, budget, author,
     asksFounder, stage, currentDecision, activeApplyBooks, rejections],
  )

  const result = useMemo(() => rank(catalogue, brief), [brief])
  const items = useMemo(
    () => Object.fromEntries(catalogue.items.map((i) => [i.work.id, i])),
    [],
  )
  const authors = useMemo(() => authorsIn(catalogue), [])

  const languageLabel = LANGUAGES.find((l) => l.tag === language)?.label ?? language
  const visible = result.decisions.slice(0, revealed)
  const more = result.decisions.length - visible.length

  const GAP_COPY: Record<CoverageGap, { head: string; body: string }> = {
    language: {
      head: `Nidus has no confirmed ${languageLabel} edition for anything in this catalogue yet.`,
      body: `The seed catalogue covers ${catalogue.languages.join(', ')} so far. Nidus will not hand you an English book and call it a ${languageLabel} match.`,
    },
    format: {
      head: `Nidus has no confirmed ${FORMAT_COPY[formatPreference].label.toLowerCase()} edition here yet.`,
      body: 'Every row in this seed catalogue is a print edition. Audiobook and ebook rows need a supplier whose catalogue Nidus can actually check, so until that exists this answer stays empty rather than pointing you at a print copy.',
    },
    author: {
      head: `Nothing by ${author} in ${languageLabel} is in this catalogue.`,
      body: 'The pilot catalogue is fourteen books by fourteen authors. Choose another author, change the language, or clear the filter.',
    },
    budget: {
      head: 'Nothing here is free for you right now.',
      body: 'Everything that matched would have to be bought, and you said free only. Out-of-copyright titles in this build are The Book of Five Rings and the Bhagavad Gita — try another purpose or mode to reach them.',
    },
  }

  return (
    <div className="min-h-dvh bg-paper">
      {/* Three tints of the palette drifting on minute-long loops. Only
          `transform` animates, nothing here is interactive, and reduced motion
          stops it dead. */}
      <div className="livewash" aria-hidden><span /><span /><span /></div>
      <div className="grain" aria-hidden />
      <a
        href="#results"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3"
      >
        Skip to the book
      </a>

      <div className="relative z-[1] mx-auto max-w-[76rem] px-4 sm:px-6 lg:px-10">
        {/* Grid break: the headline runs the full width, the sentence under it
            sits in the last five columns. Centring both would be safe and
            would say nothing. */}
        <header className="pt-10 pb-8 lg:pt-16 lg:pb-12">
          <div className="rise flex flex-wrap items-baseline justify-between gap-2">
            <Wordmark />
            <p className="label-caps text-muted">One book · not a reading list</p>
          </div>

          {/* The cold open. The situation is the headline; the product is the
              answer to it. Nothing is asked before something is offered. */}
          <h1
            key={opening.id}
            className="display rise mt-8 max-w-[19ch] text-[clamp(2.25rem,7.5vw,4.25rem)]"
            style={{ animationDelay: '80ms' }}
          >
            {opening.line}
          </h1>

          <div className="rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '260ms' }}>
            <button
              type="button"
              onClick={() => applyOpening(opening)}
              className="transition-ui min-h-12 rounded-xl bg-accent px-6 text-[17px] font-semibold text-surface hover:opacity-90 active:scale-[0.98]"
            >
              That is my evening — find the book
            </button>
            <span className="text-[15px] text-muted">One tap. No account, nothing to fill in.</span>
          </div>

          <div className="rise mt-7" style={{ animationDelay: '380ms' }}>
            <p className="label-caps mb-2 text-muted">Or another evening</p>
            <div className="flex flex-wrap gap-2">
              {OPENINGS.filter((o) => o.id !== opening.id).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => applyOpening(o)}
                  className="transition-ui min-h-11 rounded-xl border border-line bg-surface px-4 text-[15px] text-muted hover:-translate-y-px hover:border-accent hover:text-ink"
                >
                  {o.short}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="pb-24">
         <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-12">
          <section
            aria-labelledby="moment"
            className="order-2 rounded-2xl border border-line bg-surface lg:order-1 lg:col-span-5"
          >
            <button
              type="button"
              onClick={() => setFormOpen((v) => !v)}
              aria-expanded={formOpen}
              className="transition-ui flex min-h-14 w-full items-center justify-between gap-3 px-5 text-left sm:px-7"
            >
              <span>
                <span id="moment" className="display block text-[1.5rem]">Tune it yourself</span>
                <span className="text-[15px] text-muted">Language, format, budget, your venture</span>
              </span>
              <span aria-hidden className="text-[22px] text-accent">{formOpen ? '\u2212' : '+'}</span>
            </button>
            <div className={formOpen ? 'block px-5 pb-6 sm:px-7' : 'hidden'}>

            <Field legend="Purpose" layout="grid">
              {PURPOSES.map((p) => (
                <Choice key={p} name="purpose" value={p} current={purpose} label={PURPOSE_COPY[p]} onChange={setPurpose} />
              ))}
            </Field>

            <Field legend="Mode" layout="grid">
              {MODES.map((m) => (
                <Choice
                  key={m} name="mode" value={m} current={mode}
                  label={MODE_COPY[m].label} sub={MODE_COPY[m].sub} onChange={setMode}
                />
              ))}
            </Field>

            <Field
              legend="Language"
              hint="When Nidus has no confirmed edition in your language it says so. It will not hand you English instead and call it a match."
            >
              {LANGUAGES.map((l) => (
                <Choice key={l.tag} name="language" value={l.tag} current={language} label={l.label} onChange={setLanguage} />
              ))}
            </Field>

            <Field
              legend="How you want to read it"
              hint="Audiobook is a real filter, not a preference Nidus quietly ignores. The seed catalogue is print-only, so asking for audio will honestly come back empty until a supplier is connected."
            >
              {FORMAT_PREFS.map((f) => (
                <Choice
                  key={f} name="format" value={f} current={formatPreference}
                  label={FORMAT_COPY[f].label} sub={FORMAT_COPY[f].sub} onChange={setFormatPreference}
                />
              ))}
            </Field>

            <Field
              legend="What you can spend"
              hint="Nidus has no price feed and will not invent one. What it can do is keep to books already on your shelf and books out of copyright, which cost nothing to read."
              layout="grid"
            >
              {BUDGETS.map((b) => (
                <Choice
                  key={b} name="budget" value={b} current={budget}
                  label={BUDGET_COPY[b].label} sub={BUDGET_COPY[b].sub} onChange={setBudget}
                />
              ))}
            </Field>

            <Field legend="Time you actually have">
              {SESSIONS.map((s) => (
                <Choice key={s} name="session" value={s} current={sessionMinutes} label={`${s} min`} onChange={setSessionMinutes} />
              ))}
            </Field>

            <details className="mb-7 rounded-xl border border-line bg-paper p-4">
              <summary className="label-caps min-h-11 cursor-pointer py-2 text-muted">
                Start from an author instead {author && `— ${author}`}
              </summary>
              <p className="mt-2 mb-3 max-w-[58ch] text-[15px] text-muted">
                Most people pick a book because of who wrote it. Choose an author and Nidus answers only
                from their work — the rest of your moment still decides which book, and why.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAuthor(null)}
                  aria-pressed={author === null}
                  className={[
                    'transition-ui min-h-11 rounded-lg border px-3 text-[15px]',
                    author === null ? 'border-accent bg-accent-soft' : 'border-line bg-surface text-muted hover:border-accent',
                  ].join(' ')}
                >
                  Any author
                </button>
                {authors.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAuthor(a)}
                    aria-pressed={author === a}
                    className={[
                      'transition-ui min-h-11 rounded-lg border px-3 text-[15px]',
                      author === a ? 'border-accent bg-accent-soft' : 'border-line bg-surface text-muted hover:border-accent',
                    ].join(' ')}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </details>

            {asksFounder && (
              <details className="mb-7 rounded-xl border border-line bg-paper p-4">
                <summary className="label-caps min-h-11 cursor-pointer py-2 text-muted">
                  Your venture — optional
                </summary>
                <p className="mt-2 mb-4 max-w-[58ch] text-[15px] text-muted">
                  Asked only because you chose to build something, and only so Nidus does not hand you a
                  scaling book while you are still looking for the first customer. Reading cannot replace
                  customer contact, selling or management practice.
                </p>

                <div className="mb-4 flex flex-wrap gap-2">
                  {FOUNDER_STAGES.map((s) => (
                    <Choice key={s} name="stage" value={s} current={stage} label={STAGE_COPY[s]} onChange={setStage} />
                  ))}
                </div>

                <label className="block">
                  <span className="text-[15px] font-medium">The decision in front of you</span>
                  <input
                    type="text"
                    value={currentDecision}
                    onChange={(e) => setCurrentDecision(e.target.value)}
                    placeholder="Whether to charge for the pilot"
                    className="mt-2 min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[16px] placeholder:text-muted/70"
                  />
                  <span className="mt-1 block text-[14px] text-muted">Stays in this browser. Skip it if you would rather not say.</span>
                </label>

                <label className="mt-4 flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={activeApplyBooks > 0}
                    onChange={(e) => setActiveApplyBooks(e.target.checked ? 1 : 0)}
                    className="size-5 accent-[var(--color-accent)]"
                  />
                  <span className="text-[16px]">I already have an Apply book open</span>
                </label>
              </details>
            )}

            <button
              type="button"
              onClick={answer}
              className="transition-ui min-h-12 w-full rounded-xl bg-accent px-6 text-[17px] font-semibold text-surface hover:opacity-90 sm:w-auto"
            >
              Find my next read
            </button>
            <p className="mt-3 text-[15px] text-muted">
              Adding a book you already own arrives with My&nbsp;Shelf. It is not in this build.
            </p>
            </div>
          </section>

          <section
            id="results" aria-labelledby="next" aria-live="polite"
            className="order-1 lg:order-2 lg:col-span-7"
          >
            <h2 id="next" className="display mb-5 text-[2rem]">Your next read</h2>

            {shown && result.decisions.length > 0 && (
              <Trace
                key={`trace-${runId}`}
                total={catalogue.items.length}
                excluded={result.excluded}
                scored={catalogue.items.length - result.excluded.length}
                purpose={PURPOSE_COPY[purpose]}
                mode={MODE_COPY[mode].label}
                minutes={sessionMinutes}
              />
            )}

            {!shown ? (
              <p className="rounded-2xl border border-dashed border-line bg-surface p-6 text-muted">
                Nothing yet. Pick the evening that sounds like yours, above.
              </p>
            ) : result.gap !== null ? (
              <div className="rounded-2xl border border-amber bg-amber-soft p-6">
                <p className="font-medium">{GAP_COPY[result.gap].head}</p>
                <p className="mt-2 max-w-[58ch] text-[15px] text-muted">{GAP_COPY[result.gap].body}</p>
              </div>
            ) : result.decisions.length === 0 ? (
              <div className="rounded-2xl border border-line bg-surface p-6">
                <p className="font-medium">Nothing here fits that combination.</p>
                <p className="mt-2 max-w-[58ch] text-[15px] text-muted">
                  {rejections.length > 0
                    ? 'You have set aside everything that matched. Change the mode, the time, or put one back.'
                    : 'The seed catalogue is small. Try another mode or another purpose.'}
                </p>
              </div>
            ) : (
              <>
                <div className="mb-5 max-w-[62ch] space-y-1 text-[15px] text-muted">
                  <p>{result.decisions[0].whyNow}</p>
                  <p>{result.decisions[0].whyThisMode}</p>
                </div>
                <ol className="space-y-4">
                  {visible.map((d) => {
                    const item = items[d.workId]
                    const deferred = d.recommendedUsage === 'DEFER'
                    return (
                      <li key={d.workId} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <Badge>{ROLE_COPY[d.role]}</Badge>
                          <Badge>{ACCESS_COPY[d.accessRoute]}</Badge>
                          {deferred && <Badge tone="amber">{USAGE_COPY.DEFER}</Badge>}
                        </div>

                        <h3 className="book-voice text-[2rem]">{item.work.title}</h3>
                        <p className="text-muted">
                          <button
                            type="button"
                            onClick={() => { setAuthor(item.work.author); answer() }}
                            className="underline underline-offset-2 hover:text-ink"
                          >
                            {item.work.author}
                          </button>
                          {' '}· more from this author
                        </p>

                        {/* Plain English first, before any of Nidus's own reasoning, and
                            set in the book's own voice rather than the interface's. */}
                        <p className="book-voice mt-4 max-w-[36ch] text-[1.5rem] text-ink">
                          {item.profile.inOneLine}
                        </p>

                        {item.work.popularity && (
                          <p className="mt-2 text-[15px] text-muted">
                            {item.work.popularity.claim} — {item.work.popularity.source}, checked{' '}
                            {item.work.popularity.confirmedAt}.
                          </p>
                        )}

                        {/* For a close match this sentence is word-for-word the purpose row
                            of the arithmetic below, so printing it twice is noise. It is
                            kept for the exploration slot, where it carries the "offered as
                            a different direction" framing the bars cannot. */}
                        {d.role === 'exploration' && (
                          <p className="mt-4 max-w-[54ch] text-[15px] text-muted">{d.whyThisBook}</p>
                        )}

                        {deferred && d.deferReason && (
                          <p className="mt-3 max-w-[62ch] rounded-lg border border-amber bg-amber-soft p-3 text-[15px]">
                            {d.deferReason}
                          </p>
                        )}

                        <dl className="mt-4 space-y-3 text-[15px]">
                          <div>
                            <dt className="label-caps text-muted">First reading step</dt>
                            <dd className="max-w-[62ch]">{d.firstStep}</dd>
                          </div>
                          {d.realWorldAction && (
                            <div>
                              <dt className="label-caps text-muted">Away from the page</dt>
                              <dd className="max-w-[62ch]">{d.realWorldAction}</dd>
                            </div>
                          )}
                          {d.missingPrerequisites.length > 0 && (
                            <div>
                              <dt className="label-caps text-muted">Assumes you know</dt>
                              <dd className="max-w-[62ch]">
                                {d.missingPrerequisites.map((id) => items[id]?.work.title ?? id).join(', ')}
                              </dd>
                            </div>
                          )}
                        </dl>

                        <details className="mt-4">
                          <summary className="min-h-11 cursor-pointer py-2 text-[16px] font-medium text-accent">
                            How do I get hold of it?
                          </summary>
                          <div className="mt-2 max-w-[62ch] space-y-2 text-[15px] text-muted">
                            <p>
                              {d.accessRoute === 'on-your-shelf'
                                ? 'You told Nidus this one is already yours, so there is nothing to arrange.'
                                : d.accessRoute === 'public-domain'
                                  ? 'This text is out of copyright. A free, legal edition is easy to find — the translation you pick will change the reading, so choose one deliberately.'
                                  : 'You would have to get hold of a copy. Nidus does not sell books and takes no commission.'}
                            </p>
                            <p className="rounded-lg border border-amber bg-amber-soft p-3 text-ink">
                              <strong className="font-medium">Nidus cannot see shop stock.</strong> It has no feed
                              from any bookshop, online or on your street, so it will never tell you a copy is
                              waiting for you. Checking a neighbourhood shop means asking a real person there,
                              and the ask-a-shop flow needs a shop that has agreed to answer. None has yet.
                            </p>
                          </div>
                        </details>

                        {/* key: remount on a new decision so the bars fill again rather
                            than jumping to the new width with no arithmetic shown. */}
                        <Reasoning
                          key={`${d.workId}-${d.score}`}
                          components={d.components}
                          score={d.score}
                          branch={d.branch}
                          rankerVersion={d.rankerVersion}
                          catalogueVersion={d.catalogueVersion}
                        />

                        <details className="mt-3 rounded-xl border border-amber bg-amber-soft p-3">
                          <summary className="label-caps min-h-11 cursor-pointer py-2 text-amber">
                            What this cannot do ({d.cannotDo.length})
                          </summary>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]">
                            {d.cannotDo.map((l) => <li key={l} className="max-w-[58ch]">{l}</li>)}
                          </ul>
                        </details>

                        <div className="mt-5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setChosen(d.workId)
                              setTaken((prev) => prev.includes(d.workId) ? prev : [...prev, d.workId])
                            }}
                            aria-pressed={chosen === d.workId}
                            className="transition-ui min-h-11 rounded-xl bg-accent px-5 text-[16px] font-semibold text-surface hover:opacity-90"
                          >
                            {chosen === d.workId ? 'Chosen — nothing saved' : 'Choose this book'}
                          </button>
                          <details>
                            <summary className="transition-ui inline-flex min-h-11 cursor-pointer list-none items-center rounded-xl border border-line px-5 text-[16px] text-muted hover:text-ink">
                              Not right for me
                            </summary>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {REJECTION_REASONS.map((reason) => (
                                <button
                                  key={reason}
                                  type="button"
                                  onClick={() => { setRejections((prev) => [...prev, { workId: d.workId, reason }]); setRevealed(1) }}
                                  className="transition-ui min-h-11 rounded-lg border border-line bg-paper px-3 text-[15px] hover:border-accent"
                                >
                                  {REJECTION_COPY[reason]}
                                </button>
                              ))}
                            </div>
                          </details>
                        </div>
                      </li>
                    )
                  })}
                </ol>

                {more > 0 && (
                  <button
                    type="button"
                    onClick={() => setRevealed((n) => n + 1)}
                    className="transition-ui mt-4 min-h-11 w-full rounded-xl border border-line bg-surface px-5 text-[16px] text-muted hover:border-accent hover:text-ink"
                  >
                    Show me one more ({more} left)
                  </button>
                )}
              </>
            )}

            {/* The reason to come back, stated at the moment of most interest and
                scoped honestly. This is the memory claim made visible: a chatbot
                re-suggests the same book in a month, and this is what stops it.
                The strip says out loud that this copy lasts until reload — the
                promise is only worth making if the limit is admitted with it. */}
            {taken.length > 0 && (
              <div className="rise mt-6 rounded-2xl border border-accent bg-accent-soft p-5">
                <p className="label-caps text-accent">What Nidus now knows</p>
                <ul className="mt-3 space-y-1">
                  {taken.map((id) => (
                    <li key={id} className="text-[15px]">
                      You took <span className="font-medium">{items[id]?.work.title ?? id}</span>. It
                      will not be offered to you again.
                    </li>
                  ))}
                </ul>
                <p className="mt-3 max-w-[54ch] text-[14px] text-muted">
                  In this build that lasts until you reload the page. The version that keeps it for
                  years is built and tested in the server, and is not connected here yet. It is the
                  whole reason Nidus is not a chat window.
                </p>
              </div>
            )}

            {/* One gap left deliberately open. */}
            {shown && result.decisions.length > 0 && (
              <div className="mt-6 border-t border-line pt-5">
                <p className="text-[15px] text-muted">
                  {OPENINGS.length - 1} other evenings are in here. One of them is probably closer to
                  the reason you opened this tab.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {OPENINGS.filter((o) => o.id !== openingId).slice(0, 3).map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => applyOpening(o)}
                      className="transition-ui min-h-11 rounded-xl border border-line bg-surface px-4 text-[15px] text-muted hover:-translate-y-px hover:border-accent hover:text-ink"
                    >
                      {o.short}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {rejections.length > 0 && (
              <p className="mt-4 max-w-[62ch] text-[15px] text-muted">
                Set aside in this session:{' '}
                {rejections.map((r) => `${items[r.workId]?.work.title ?? r.workId} (${REJECTION_COPY[r.reason].toLowerCase()})`).join(', ')}.{' '}
                <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => setRejections([])}>
                  Put them back
                </button>
              </p>
            )}
          </section>
         </div>

          <Shelves onPick={applyShelf} />

          <section aria-labelledby="vs" className="mt-16 rounded-2xl border border-line bg-surface p-6 sm:p-10">
            <h2 id="vs" className="display text-[2rem]">Why not just ask a chatbot?</h2>
            <p className="mt-3 max-w-[62ch] text-muted">
              Fair question, and a general assistant will give you a longer list faster. Four things
              are different here, and only the first three are true in this build.
            </p>
            <ul className="mt-4 max-w-[62ch] list-disc space-y-3 pl-5">
              <li>
                <strong className="font-medium">It answers with one book.</strong> A list of ten is a
                decision you still have to make. Nidus commits to one, and shows the arithmetic.
              </li>
              <li>
                <strong className="font-medium">It says what the book cannot do.</strong> Every card
                carries that section, including the part where reading is not a substitute for the work.
              </li>
              <li>
                <strong className="font-medium">It refuses rather than approximates.</strong> No Telugu
                edition means it says so, instead of handing you English and calling it close enough.
              </li>
              <li>
                <strong className="font-medium">It will remember — not yet here.</strong> A chatbot loses
                the thread and re-suggests the same book in a month. Nidus keeps a reading record that is
                yours, so nothing it has already given you comes back. That record is built and tested in
                the server, and this browser-only build is not wired to it.
              </li>
            </ul>
          </section>

          <footer className="mt-12 border-t border-line pt-6 text-[15px] text-muted">
            <p className="max-w-[62ch]">
              Pilot build, adults only. No account, no cookie, no saved record. Catalogue rows are drafts
              and none has been confirmed against a bibliographic source, so treat every edition detail as
              provisional. Sales and popularity figures are shown only where a dated source is recorded —
              none is, so none appears, and they move no ranking either way. My&nbsp;Shelf, My&nbsp;Journey,
              saved journeys, the weekly rhythm, coupons, edition requests and the ask-a-shop flow are not
              in this build.
            </p>
            {catalogue.rejected.length > 0 && (
              <p className="mt-2 max-w-[62ch]">
                {catalogue.rejected.length} catalogue rows failed validation and were left out:{' '}
                {catalogue.rejected.map((r) => `${r.list}/${String(r.id)}`).join(', ')}.
              </p>
            )}
          </footer>
        </main>
      </div>
    </div>
  )
}
