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
import { authorsIn } from './domain/catalogue.ts'
import { rank } from './domain/ranker.ts'
import type { CoverageGap } from './domain/ranker.ts'

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

  function restart() {
    setShown(true)
    setRevealed(1)
  }

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
      <a
        href="#results"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3"
      >
        Skip to the book
      </a>

      <div className="mx-auto max-w-[42rem] px-4 sm:px-6">
        <header className="pt-10 pb-6">
          <p className="label-caps text-accent">Nidus</p>
          <p className="text-[15px] text-muted">Read alone. Grow together.</p>
          <h1 className="mt-6 max-w-[18ch] text-[2rem] leading-[1.15] font-semibold text-balance sm:text-[2.5rem]">
            One book. Not a reading list.
          </h1>
          <p className="mt-3 max-w-[58ch] text-muted">
            Tell Nidus what today actually looks like. It answers with a single book, the reason it
            picked that one, and what the book cannot do for you. Nothing on this page is saved —
            reload and Nidus forgets you were here.
          </p>
        </header>

        <main className="pb-20">
          <section aria-labelledby="moment" className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
            <h2 id="moment" className="mb-6 text-[1.375rem] font-semibold">Your moment</h2>

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
              onClick={restart}
              className="transition-ui min-h-12 w-full rounded-xl bg-accent px-6 text-[17px] font-semibold text-surface hover:opacity-90 sm:w-auto"
            >
              Find my next read
            </button>
            <p className="mt-3 text-[15px] text-muted">
              Adding a book you already own arrives with My&nbsp;Shelf. It is not in this build.
            </p>
          </section>

          <section id="results" aria-labelledby="next" aria-live="polite" className="mt-8">
            <h2 id="next" className="mb-4 text-[1.375rem] font-semibold">Your next read</h2>

            {!shown ? (
              <p className="rounded-2xl border border-dashed border-line bg-surface p-6 text-muted">
                Nothing suggested yet. Set your moment above, then choose <em>Find my next read</em>.
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

                        <h3 className="text-[1.25rem] leading-snug font-semibold">{item.work.title}</h3>
                        <p className="text-muted">
                          <button
                            type="button"
                            onClick={() => { setAuthor(item.work.author); restart() }}
                            className="underline underline-offset-2 hover:text-ink"
                          >
                            {item.work.author}
                          </button>
                          {' '}· more from this author
                        </p>

                        {/* Plain English first, before any of Nidus's own reasoning. */}
                        <p className="mt-3 max-w-[62ch] text-[17px]">{item.profile.inOneLine}</p>

                        {item.work.popularity && (
                          <p className="mt-2 text-[15px] text-muted">
                            {item.work.popularity.claim} — {item.work.popularity.source}, checked{' '}
                            {item.work.popularity.confirmedAt}.
                          </p>
                        )}

                        <p className="mt-3 max-w-[62ch] text-[15px] text-muted">{d.whyThisBook}</p>

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

                        <details className="mt-3">
                          <summary className="min-h-11 cursor-pointer py-2 text-[16px] font-medium text-accent">
                            Why this book?
                          </summary>
                          <table className="mt-2 w-full text-[15px]">
                            <caption className="sr-only">Score components for {item.work.title}</caption>
                            <tbody>
                              {d.components.map((c) => (
                                <tr key={c.signal} className="border-b border-line last:border-0">
                                  <td className="py-2 pr-3 align-top text-muted">{c.text}</td>
                                  <td className="py-2 text-right align-top font-medium tabular-nums whitespace-nowrap">
                                    {c.points > 0 ? '+' : ''}{c.points}
                                    <span className="text-muted"> / {c.maxPoints}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="mt-3 max-w-[62ch] text-[14px] text-muted">
                            {d.score} out of 100 on the {d.branch} ranker. This is a rule total, not a
                            prediction that the book will work for you. Popularity and sales figures move
                            none of it. Ranker {d.rankerVersion}, catalogue {d.catalogueVersion}.
                          </p>
                        </details>

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
                            onClick={() => setChosen(d.workId)}
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

          <section aria-labelledby="vs" className="mt-10 rounded-2xl border border-line bg-surface p-5 sm:p-7">
            <h2 id="vs" className="text-[1.375rem] font-semibold">Why not just ask a chatbot?</h2>
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
