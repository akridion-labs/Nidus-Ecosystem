import { useMemo, useState } from 'react'
import type { ReadingBrief } from '../domain/contracts.ts'
import type { LoadedCatalogue, CatalogueItem } from '../domain/catalogue.ts'
import { isEligible } from '../domain/ranker.ts'
import type { RankResult } from '../domain/ranker.ts'
import { laneCounts, imbalance } from '../domain/lanes.ts'

/**
 * Your reading order — what you are in, what is next, what is waiting and why.
 *
 * WHY THIS EXISTS
 *
 * Nidus answers "what should I read tonight" well and has never answered
 * "where am I". A reader with thirty books owned and two finished holds the
 * order in their head, and the product that chose the order was no help in
 * remembering it.
 *
 * THE PART THAT IS NEW RATHER THAN A VIEW
 *
 * The balance strip at the bottom. The shelf map of 12 October found eleven
 * books on mindset and zero on customers, and noted that this is something
 * Nidus can compute from data it already holds and that no competitor does.
 * It has sat in a document since. Here it is, computed live:
 *
 *   a lane four or more deep, beside a lane at zero that this reader's stage
 *   needs, is said out loud rather than answered with a fifth book from the
 *   deep one.
 *
 * It is deliberately a sentence and not a chart. "You have eleven on mindset
 * and none on customers" is the finding; a bar chart of it is decoration.
 *
 * WHAT IT REFUSES TO DO
 *
 * No streaks, no completion percentage, no badge for finishing. DR-007 settled
 * that: the betting-app feeling comes from the mechanic, not from its styling.
 * Waiting books show the REASON they are waiting, because "locked" with no
 * reason is the pattern that decision record refused.
 */

type Props = {
  catalogue: LoadedCatalogue
  brief: ReadingBrief
  result: RankResult
  reading: string[]
  finished: string[]
  owned: string[]
  onPick?: (workId: string) => void
}

export function Pipeline({ catalogue, brief, result, reading, finished, owned, onPick }: Props) {
  const [open, setOpen] = useState<string | null>(null)

  const byId = useMemo(
    () => Object.fromEntries(catalogue.items.map((i) => [i.work.id, i])) as Record<string, CatalogueItem>,
    [catalogue],
  )

  const next = result.decisions.find((d) => d.role === 'strongest-fit')

  /**
   * Owned, not read, and the ranker will not offer it. The reason comes from
   * the same eligibility function the ranker uses, so this cannot drift into a
   * second opinion about why a book is unavailable.
   */
  const waiting = useMemo(() => {
    const owned = brief.intents.filter((i) => i.status === 'OWNED').map((i) => i.workId)
    return owned
      .map((id) => byId[id])
      .filter(Boolean)
      .map((item) => ({ item, verdict: isEligible(item, brief) }))
      .filter((x) => !x.verdict.ok && 'kind' in x.verdict
        && ['stage', 'prerequisite', 'mode', 'shape'].includes(x.verdict.kind))
      .slice(0, 4)
  }, [brief, byId])

  /** The balance strip. Counting lives in the domain so it can be tested. */
  const lanes = useMemo(
    () => laneCounts(catalogue, [...reading, ...finished, ...owned]),
    [catalogue, reading, finished, owned],
  )

  const stage = brief.founderContext?.stage ?? null
  const found = imbalance(lanes, stage)
  const held = lanes.reduce((n, l) => n + l.count, 0)

  if (held === 0 && !next) return null

  return (
    <section aria-labelledby="pipeline" className="mt-16 rounded-2xl border border-line bg-surface p-6 sm:p-10">
      <h2 id="pipeline" className="display text-[2rem]">Your reading order</h2>
      <p className="mt-3 max-w-[58ch] text-muted">
        Built from what you have told Nidus in this session. It is not a plan you have to keep —
        it is what the same arithmetic says about the books you already own.
      </p>

      <ol className="mt-8 space-y-3">
        {reading.map((id, n) => byId[id] && (
          <Row
            key={id} index={n} tone="now" label="Reading now"
            title={byId[id].work.title} author={byId[id].work.author}
            detail={byId[id].profile.inOneLine}
          />
        ))}

        {next && byId[next.workId] && (
          <Row
            index={reading.length} tone="next" label="Next"
            title={byId[next.workId].work.title} author={byId[next.workId].work.author}
            detail={byId[next.workId].profile.suggestedArtifact
              ? `Owes you: ${byId[next.workId].profile.suggestedArtifact}`
              : byId[next.workId].profile.inOneLine}
            score={next.score}
            expanded={open === next.workId}
            onToggle={() => setOpen(open === next.workId ? null : next.workId)}
            why={next.components.filter((cp) => cp.points !== 0).map((cp) => cp.text)}
            onPick={onPick ? () => onPick(next.workId) : undefined}
          />
        )}

        {waiting.map(({ item, verdict }, n) => (
          <Row
            key={item.work.id} index={reading.length + 1 + n} tone="waiting" label="Waiting"
            title={item.work.title} author={item.work.author}
            detail={'reason' in verdict ? capitalise(verdict.reason) : 'Not offered yet.'}
          />
        ))}
      </ol>

      {/* The balance strip — the shelf map's finding, computed rather than written down. */}
      {held >= 3 && (
        <div className="mt-8 border-t border-line pt-6">
          <p className="label-caps text-muted">What your shelf is made of</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {lanes.filter((l) => l.count > 0 || l.neededAt === stage).map((l) => (
              <li
                key={l.id}
                className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-[15px] ${
                  l.count === 0 ? 'border-amber bg-amber-soft text-amber' : 'border-line'
                }`}
              >
                <span>{l.label}</span>
                <span className="tabular-nums font-semibold">{l.count}</span>
                {l.count === 0 && <span className="label-caps">none</span>}
              </li>
            ))}
          </ul>

          {found && (
            <p className="mt-5 max-w-[62ch] rounded-xl border border-amber bg-amber-soft p-4 text-[15px]">
              <span className="font-medium">
                {found.deepest.count} books on {found.deepest.label.toLowerCase()}, none on {found.missing.label.toLowerCase()}.
              </span>{' '}
              At the stage you named, the second one is the binding constraint. Nidus is not going to
              hand you a {ordinal(found.deepest.count + 1)} from the first pile and call it progress.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1) + (s.endsWith('.') ? '' : '.')
const ordinal = (n: number) => {
  const names: Record<number, string> = { 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth',
    9: 'ninth', 10: 'tenth', 11: 'eleventh', 12: 'twelfth', 13: 'thirteenth' }
  return names[n] ?? `${n}th`
}

type RowProps = {
  index: number
  tone: 'now' | 'next' | 'waiting'
  label: string
  title: string
  author: string
  detail: string
  score?: number
  expanded?: boolean
  onToggle?: () => void
  why?: string[]
  onPick?: () => void
}

const TONE = {
  now: 'border-accent bg-accent-soft',
  next: 'border-line bg-paper',
  waiting: 'border-dashed border-line bg-surface',
} as const

function Row({ index, tone, label, title, author, detail, score, expanded, onToggle, why, onPick }: RowProps) {
  return (
    <li
      // Staggered entrance, 40ms apart, capped so a long list does not become
      // a wait. `rise` already yields to prefers-reduced-motion.
      className={`rise rounded-xl border p-4 sm:p-5 ${TONE[tone]}`}
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="label-caps text-muted">{label}</span>
        {score !== undefined && (
          <span className="label-caps tabular-nums text-muted">{score} / 100</span>
        )}
      </div>
      <p className="book-voice mt-1 text-[1.25rem]">{title}</p>
      <p className="text-[15px] text-muted">{author}</p>
      <p className="mt-2 max-w-[58ch] text-[15px]">{detail}</p>

      {(onToggle || onPick) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="transition-ui min-h-11 cursor-pointer rounded-lg border border-line px-3 text-[15px] hover:border-accent active:scale-[0.97]"
            >
              {expanded ? 'Hide the arithmetic' : 'Why this one'}
            </button>
          )}
          {onPick && (
            <button
              type="button"
              onClick={onPick}
              className="transition-ui min-h-11 cursor-pointer rounded-lg border border-accent bg-accent px-3 text-[15px] font-semibold text-surface hover:opacity-90 active:scale-[0.97]"
            >
              Open this book
            </button>
          )}
        </div>
      )}

      {expanded && why && (
        <ul className="mt-4 space-y-2 border-t border-line pt-4">
          {why.map((line, i) => (
            <li key={i} className="max-w-[60ch] text-[15px] text-muted">{line}</li>
          ))}
        </ul>
      )}
    </li>
  )
}
