import { useEffect, useRef } from 'react'
import type { CatalogueItem, LoadedCatalogue } from './domain/catalogue.ts'
import { Spine } from './brand/Spine.tsx'
import { whereToLook } from './data/wanted.ts'

/**
 * The book comes forward.
 *
 * Picking a spine off a shelf should feel like picking a book off a shelf: it
 * lifts, it turns to face you, and then it tells you what to do with it in
 * order. Three steps, because that is how many a person will actually hold.
 *
 * Built on <dialog> and showModal() rather than a hand-rolled overlay. The
 * platform gives focus trapping, Escape, inertness for the rest of the page
 * and correct screen-reader semantics for free; a div with role="dialog"
 * gives none of them and takes eighty lines to half-fix.
 *
 * Every step comes from the book's own record. None of it is generated prose
 * about the book, because Nidus has not read it.
 */
export function BookSheet({ item, catalogue, onClose }: {
  item: CatalogueItem | null
  catalogue: LoadedCatalogue
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (item && !el.open) el.showModal()
    if (!item && el.open) el.close()
  }, [item])

  if (!item) return null

  const minutes = item.profile.typicalSessionMinutes
  // Books that named this one as a prerequisite. Real edges, not a guess at
  // what "goes well with" it.
  const opens = catalogue.items.filter((i) => i.profile.prerequisites.includes(item.work.id))
  const assumes = item.profile.prerequisites
    .map((id) => catalogue.items.find((i) => i.work.id === id))
    .filter((x): x is CatalogueItem => Boolean(x))

  const steps: { n: number; head: string; body: string }[] = [
    {
      n: 1,
      head: 'Tonight',
      body: `Read for about ${minutes} minutes. ${item.profile.inOneLine}`,
    },
    {
      n: 2,
      head: 'This week',
      body: item.profile.suggestedArtifact
        ? item.profile.suggestedArtifact
        : 'Nothing to produce. This one is for thinking with, and a book that asks for homework it cannot help you do is just a longer book.',
    },
    {
      n: 3,
      head: 'After',
      body: opens.length > 0
        ? `Finishing it opens ${opens.map((i) => i.work.title).join(' and ')}.`
        : 'Nothing in this catalogue is waiting on it. Most of what you learn has no next page.',
    },
  ]

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className="book-sheet m-auto w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-ink/50"
      aria-labelledby="sheet-title"
    >
      <div className="p-6 sm:p-8">
        <div className="flex items-start gap-5">
          <div className="sheet-spine">
            <Spine item={item} tall />
          </div>
          <div className="min-w-0 grow">
            <h2 id="sheet-title" className="book-voice text-[1.75rem]">{item.work.title}</h2>
            <p className="text-[15px] text-muted">
              {item.work.author}
              {item.work.firstPublished !== null && ` · ${item.work.firstPublished}`}
            </p>
            {assumes.length > 0 && (
              <p className="mt-2 text-[14px] text-amber">
                Assumes you have read {assumes.map((i) => i.work.title).join(' and ')}.
              </p>
            )}
          </div>
        </div>

        <ol className="mt-7 space-y-5">
          {steps.map((s, i) => (
            <li
              key={s.n}
              className="rise flex gap-4"
              style={{ animationDelay: `${120 + i * 110}ms` }}
            >
              <span
                aria-hidden
                className="label-caps flex size-8 shrink-0 items-center justify-center rounded-full border border-accent text-accent"
              >
                {s.n}
              </span>
              <div className="min-w-0">
                <p className="label-caps text-muted">{s.head}</p>
                <p className="mt-1 max-w-[46ch] text-[16px]">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <WhereToLook title={item.work.title} author={item.work.author} />

        <button
          type="button"
          onClick={onClose}
          className="transition-ui mt-7 min-h-12 w-full rounded-xl border border-line px-5 text-[16px] text-muted hover:border-accent hover:text-ink"
        >
          Put it back
        </button>
      </div>
    </dialog>
  )
}

/**
 * Four searches and a sentence saying what they are not. The sentence is the
 * feature: everybody else's "buy" block implies the shop has it.
 */
export function WhereToLook({ title, author }: { title: string; author: string }) {
  return (
    <details className="mt-7 rounded-xl border border-line bg-paper p-4">
      <summary className="min-h-11 cursor-pointer py-2 text-[16px] font-medium text-accent">
        Where to find it
      </summary>
      <p className="mt-2 max-w-[46ch] text-[14px] text-muted">
        These are searches, not stock checks. Nidus has no retail feed: it cannot see a price, a
        delivery date, or whether any of these has a copy. It takes no commission and nothing here
        is ordered by who pays.
      </p>
      <ul className="mt-3 space-y-3">
        {whereToLook(title, author).map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-ui inline-flex min-h-11 items-center text-[16px] text-accent underline underline-offset-4 hover:text-ink"
            >
              {l.label}
            </a>
            <p className="max-w-[46ch] text-[14px] text-muted">{l.note}</p>
          </li>
        ))}
      </ul>
    </details>
  )
}
