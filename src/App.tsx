import { useMemo, useState } from 'react'
import { ReadingBrief, MODES, PURPOSES, FOUNDER_STAGES } from './domain/contracts.ts'
import type { Mode, Purpose, FounderStage, ReadingBrief as Brief } from './domain/contracts.ts'
import { catalogue } from './data/catalogue.ts'
import { rank } from './domain/ranker.ts'

const MODE_COPY: Record<Mode, string> = {
  enjoy: 'Company, not homework.',
  explore: 'Follow a thread and see where it goes.',
  apply: 'Something I can act on this week.',
}

const PURPOSE_COPY: Record<Purpose, string> = {
  unwind: 'Unwind',
  curiosity: 'Follow a curiosity',
  craft: 'Get better at my craft',
  decision: 'Think through a decision',
  'company-building': 'Build the company',
}

const STAGE_COPY: Record<FounderStage, string> = {
  none: 'Not building anything right now',
  idea: 'Idea stage',
  'first-customers': 'First customers',
  scaling: 'Scaling',
}

const LANGUAGES = [
  { tag: 'en', label: 'English' },
  { tag: 'hi', label: 'हिंदी' },
  { tag: 'te', label: 'తెలుగు' },
  { tag: 'ta', label: 'தமிழ்' },
]

const REJECT_REASONS = ['Read it already', 'Not the mood', 'Too heavy', 'Not relevant to me']

const SESSIONS = [10, 20, 30, 45]

function Field({ legend, hint, children }: { legend: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-7 border-0 p-0">
      <legend className="mb-1 text-sm font-semibold tracking-wide text-ink uppercase">{legend}</legend>
      {hint && <p className="mb-3 text-sm text-muted">{hint}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}

function Choice<T extends string | number>({
  name, value, current, label, sub, onChange,
}: { name: string; value: T; current: T; label: string; sub?: string; onChange: (v: T) => void }) {
  const selected = current === value
  return (
    <label
      className={[
        'cursor-pointer rounded-lg border px-4 py-2.5 text-left transition-colors',
        selected
          ? 'border-accent bg-accent-soft text-ink'
          : 'border-line bg-surface text-muted hover:border-accent hover:text-ink',
      ].join(' ')}
    >
      <input
        type="radio"
        name={name}
        className="sr-only"
        checked={selected}
        onChange={() => onChange(value)}
      />
      <span className="block text-[15px] font-medium">{label}</span>
      {sub && <span className="block text-[13px] text-muted">{sub}</span>}
    </label>
  )
}

export default function App() {
  const [purpose, setPurpose] = useState<Purpose>('company-building')
  const [mode, setMode] = useState<Mode>('apply')
  const [language, setLanguage] = useState('en')
  const [sessionMinutes, setSessionMinutes] = useState(20)
  const [founderStage, setFounderStage] = useState<FounderStage>('idea')
  const [rejected, setRejected] = useState<Record<string, string>>({})
  const [shown, setShown] = useState(false)
  const [started, setStarted] = useState<string | null>(null)

  const brief: Brief = useMemo(
    () =>
      ReadingBrief.parse({
        purpose, mode, language, sessionMinutes, founderStage,
        rejectedIds: Object.keys(rejected),
      }),
    [purpose, mode, language, sessionMinutes, founderStage, rejected],
  )

  const result = useMemo(() => rank(catalogue.editions, brief), [brief])
  const byId = useMemo(
    () => Object.fromEntries(catalogue.editions.map((e) => [e.id, e])),
    [],
  )

  const rejectBook = (id: string, reason: string) =>
    setRejected((prev) => ({ ...prev, [id]: reason }))

  return (
    <div className="min-h-dvh bg-paper">
      <a
        href="#results"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to the books
      </a>

      <header className="mx-auto max-w-2xl px-5 pt-10 pb-6">
        <p className="text-[13px] font-semibold tracking-[0.18em] text-accent uppercase">Nidus</p>
        <h1 className="mt-2 text-3xl font-semibold text-balance sm:text-4xl">Read alone. Grow together.</h1>
        <p className="mt-3 text-muted">
          Tell Nidus what this reading is for and how long you actually have. It suggests up to three
          books, says why, and says what it cannot promise. Nothing on this page is saved.
        </p>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-20">
        <section aria-labelledby="moment" className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
          <h2 id="moment" className="mb-6 text-xl font-semibold">Your moment</h2>

          <Field legend="What is this reading for?">
            {PURPOSES.map((p) => (
              <Choice key={p} name="purpose" value={p} current={purpose} label={PURPOSE_COPY[p]} onChange={setPurpose} />
            ))}
          </Field>

          <Field legend="How do you want to use the book?">
            {MODES.map((m) => (
              <Choice
                key={m} name="mode" value={m} current={mode}
                label={m[0].toUpperCase() + m.slice(1)} sub={MODE_COPY[m]} onChange={setMode}
              />
            ))}
          </Field>

          <Field legend="Language" hint="Nidus will say so when it has no edition in your language rather than quietly giving you English.">
            {LANGUAGES.map((l) => (
              <Choice key={l.tag} name="language" value={l.tag} current={language} label={l.label} onChange={setLanguage} />
            ))}
          </Field>

          <Field legend="Minutes you actually have">
            {SESSIONS.map((s) => (
              <Choice key={s} name="session" value={s} current={sessionMinutes} label={`${s} min`} onChange={setSessionMinutes} />
            ))}
          </Field>

          <details className="rounded-lg border border-line bg-paper p-4">
            <summary className="cursor-pointer text-[15px] font-medium">
              Optional: where you are as a founder
            </summary>
            <p className="mt-2 mb-3 text-sm text-muted">
              Used only in Apply mode, to avoid handing you a scaling book at idea stage. Leave it alone if
              it does not apply.
            </p>
            <div className="flex flex-wrap gap-2">
              {FOUNDER_STAGES.map((s) => (
                <Choice key={s} name="stage" value={s} current={founderStage} label={STAGE_COPY[s]} onChange={setFounderStage} />
              ))}
            </div>
          </details>

          <button
            type="button"
            onClick={() => setShown(true)}
            className="mt-7 w-full rounded-xl bg-accent px-6 py-3.5 text-[17px] font-semibold text-surface hover:opacity-90 sm:w-auto"
          >
            Show me a book
          </button>
        </section>

        <section id="results" aria-labelledby="next" aria-live="polite" className="mt-8">
          <h2 id="next" className="mb-4 text-xl font-semibold">Your next book</h2>

          {!shown ? (
            <p className="rounded-2xl border border-dashed border-line bg-surface p-6 text-muted">
              Nothing suggested yet. Set your moment above, then choose <em>Show me a book</em>.
            </p>
          ) : result.languageGap ? (
            <div className="rounded-2xl border border-caution bg-caution-soft p-6">
              <p className="font-medium text-ink">
                Nidus has no confirmed {LANGUAGES.find((l) => l.tag === language)?.label} edition for anything
                in this catalogue yet.
              </p>
              <p className="mt-2 text-sm text-muted">
                It will not hand you an English book instead and call it a match. The seed catalogue covers{' '}
                {catalogue.languages.join(', ')} so far.
              </p>
            </div>
          ) : result.decisions.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-6">
              <p className="font-medium">Nothing here fits that combination.</p>
              <p className="mt-2 text-sm text-muted">
                {Object.keys(rejected).length > 0
                  ? 'You have set aside everything that matched. Change the mode or the time you have.'
                  : 'The seed catalogue is small. Try another mode, or a different purpose.'}
              </p>
            </div>
          ) : (
            <>
            <p className="mb-4 text-[15px] text-muted">{result.decisions[0].whyNow}</p>
            <ol className="space-y-4">
              {result.decisions.map((d, i) => {
                const book = byId[d.editionId]
                return (
                  <li key={d.editionId} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
                    <p className="text-[13px] font-semibold tracking-wide text-accent uppercase">
                      {i === 0 ? 'Start here' : `Also worth it · ${i + 1}`}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold">{book.title}</h3>
                    <p className="text-muted">{book.author}</p>

                    <details className="mt-4">
                      <summary className="cursor-pointer text-[15px] font-medium text-accent">Why this book?</summary>
                      <ul className="mt-2 space-y-1.5 text-[15px] text-muted">
                        {d.reasons.map((r) => (
                          <li key={r.signal} className="flex gap-2">
                            <span aria-hidden="true">{r.points > 0 ? '+' : '−'}</span>
                            <span>{r.text}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-[13px] text-muted">
                        These are rule matches, not a prediction that the book will work for you.
                        Ranker {d.rankerVersion}.
                      </p>
                    </details>

                    <details className="mt-3 rounded-lg border border-caution bg-caution-soft p-3">
                      <summary className="cursor-pointer text-[13px] font-semibold tracking-wide text-caution uppercase">
                        What this does not promise ({d.limitations.length})
                      </summary>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                        {d.limitations.map((l) => <li key={l}>{l}</li>)}
                      </ul>
                    </details>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setStarted(d.editionId)}
                        aria-pressed={started === d.editionId}
                        className="rounded-lg bg-accent px-4 py-2 text-[15px] font-semibold text-surface hover:opacity-90"
                      >
                        {started === d.editionId
                          ? `Started — ${book.minSessionMinutes} min, nothing saved`
                          : `Read ${book.minSessionMinutes} minutes of this`}
                      </button>
                      <details className="relative">
                        <summary className="cursor-pointer rounded-lg border border-line px-4 py-2 text-[15px] text-muted hover:text-ink">
                          Not this one
                        </summary>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {REJECT_REASONS.map((reason) => (
                            <button
                              key={reason}
                              type="button"
                              onClick={() => rejectBook(d.editionId, reason)}
                              className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm hover:border-accent"
                            >
                              {reason}
                            </button>
                          ))}
                        </div>
                      </details>
                    </div>
                  </li>
                )
              })}
            </ol>
            </>
          )}

          {Object.keys(rejected).length > 0 && (
            <p className="mt-4 text-sm text-muted">
              Set aside this session: {Object.entries(rejected).map(([id, why]) => `${byId[id]?.title ?? id} (${why.toLowerCase()})`).join(', ')}.{' '}
              <button type="button" className="underline hover:text-ink" onClick={() => setRejected({})}>
                Put them back
              </button>
            </p>
          )}
        </section>

        <footer className="mt-12 border-t border-line pt-6 text-sm text-muted">
          <p>
            Pilot build, adults only. No account, no cookie, no saved record: reload and this page forgets
            everything. Catalogue rows are drafts and none has been confirmed against a bibliographic source
            yet, so treat every edition detail as provisional.
          </p>
          {catalogue.rejected.length > 0 && (
            <p className="mt-2">
              {catalogue.rejected.length} catalogue row(s) failed validation and were left out:{' '}
              {catalogue.rejected.map((r) => String(r.id)).join(', ')}.
            </p>
          )}
        </footer>
      </main>
    </div>
  )
}
