/**
 * The mark: Nidus is Latin for nest. Three arcs make the nest, the shape
 * resting in it is both the egg and the round of a closed book's spine.
 *
 * Drawn rather than imported so it inherits `currentColor`, scales with the
 * text beside it, and costs no request. Deliberately plain — a working
 * wordmark to build against, not a finished identity.
 */
export function NestMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32" aria-hidden
      className="shrink-0 overflow-visible"
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M4 18a12 8 0 0 0 24 0" strokeWidth="2.2" />
        <path d="M7.5 16.2a8.5 6 0 0 0 17 0" strokeWidth="1.8" opacity=".7" />
        <path d="M11 14.6a5 4 0 0 0 10 0" strokeWidth="1.5" opacity=".45" />
      </g>
      <circle cx="16" cy="10.5" r="3" fill="currentColor" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-accent">
      <NestMark />
      <span
        className="text-[1.375rem] leading-none"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.16em' }}
      >
        NIDUS
      </span>
    </span>
  )
}
