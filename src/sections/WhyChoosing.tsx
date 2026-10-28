import facts from '../data/reading-facts.json'

/**
 * Why choosing matters more than reading a lot — derived, not asserted.
 *
 * The obvious version of this section is a big scary number: millions of books
 * published a year, you will read a handful, so choose well. That number does
 * not exist. `tools/reading-arithmetic.mjs` went looking and found that the
 * International ISBN Agency publishes no global total, the one real survey
 * deliberately publishes none, and UNESCO stopped collecting the data in the
 * 2000s. The figure everyone quotes traces to a compiled table from 2013-2018.
 *
 * So the section argues from the other end of the same telescope, which is both
 * sourceable and sharper: the median adult reads two books a year. The scarcity
 * is not the size of the library, it is that most people get about two attempts
 * a year — which makes "which two" close to the whole question.
 *
 * Everything on screen comes from the generated JSON. Nothing is typed in here,
 * so a claim cannot drift from its source, and a source that goes stale takes
 * the sentence off the page rather than leaving it there looking confident.
 */
export function WhyChoosing() {
  const d = facts.derived

  return (
    <section aria-labelledby="why-choosing" className="mt-16 rounded-2xl border border-line bg-surface p-6 sm:p-10">
      <h2 id="why-choosing" className="display text-[2rem]">Why which book matters</h2>

      {d && (
        <>
          <p className="book-voice mt-4 max-w-[30ch] text-[1.75rem]">
            The median adult reads {d.medianBooksPerYear} books a year.
          </p>

          {/* The division, shown. The same reflex as the score bars: a number
              you can check beats a number you are asked to believe. */}
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[17px]">
            <span className="tabular-nums">52 weeks</span>
            <span className="text-muted">÷</span>
            <span className="tabular-nums">{d.medianBooksPerYear} books</span>
            <span className="text-muted">=</span>
            <span className="tabular-nums font-medium text-accent">
              one book every {d.weeksPerBookAtMedian} weeks
            </span>
          </div>

          <p className="mt-5 max-w-[58ch] text-muted">
            So &ldquo;a book a week&rdquo; is not a baseline anyone is falling short of. It is{' '}
            <span className="text-ink">{d.aBookAWeekMultiple} times</span> what the median person
            manages, and {Math.round(d.shareWhoReadNothing * 100)}% read no books at all. The
            scarcity is not that there are too many books. It is that most people get about two
            attempts a year — which makes <span className="text-ink">which two</span> close to the
            whole question.
          </p>

          <p className="mt-3 max-w-[58ch] text-[14px] text-muted">
            {d.source.caveat}{' '}
            <a href={d.source.url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-ink">
              {d.source.org}, {d.source.dataYear}
            </a>.
          </p>
        </>
      )}

      {/* What reading does — each claim wearing its design and its limitation
          in the same breath, never in a footnote. */}
      <div className="mt-10 border-t border-line pt-6">
        <p className="label-caps text-muted">What reading is shown to do</p>
        <ul className="mt-4 space-y-5">
          {facts.studies.map((s) => (
            <li key={s.id} className="max-w-[62ch]">
              <p className="text-[17px]">
                {s.claim}{' '}
                <span className="label-caps align-[0.1em] text-amber">{s.design}</span>
              </p>
              <p className="mt-1 text-[15px] text-muted">{s.finding}. {s.detail}</p>
              <p className="mt-1 text-[15px]">
                <span className="font-medium">What it does not show:</span>{' '}
                <span className="text-muted">{s.limitation}</span>
              </p>
              <p className="mt-1 text-[14px] text-muted">
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-ink">
                  {s.citation}
                </a>
              </p>
            </li>
          ))}
        </ul>
      </div>

      {/* The refusals. This is the part that would normally be left out, and it
          is the part that makes the rest believable. */}
      <div className="mt-10 border-t border-line pt-6">
        <p className="label-caps text-amber">Three things this page wanted to tell you and cannot</p>
        <ul className="mt-4 space-y-4">
          {facts.refused.map((r) => (
            <li key={r.wanted} className="max-w-[62ch]">
              <p className="text-[17px]">{r.wanted}</p>
              <p className="mt-1 text-[15px] text-muted">{r.why}</p>
              <p className="mt-1 text-[14px] text-muted">
                <span className="line-through decoration-line">{r.whatGetsQuotedInstead}</span>{' '}
                — what gets quoted instead, including by us until we checked.
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-5 max-w-[62ch] text-[15px] text-muted">
          Every figure above is produced by <code>tools/reading-arithmetic.mjs</code>, which refuses
          any statistic whose data is more than three years old. It rejected one source on this run.
          Generated {facts.generatedOn}.
        </p>
      </div>
    </section>
  )
}
