import type { CSSProperties } from 'react'

/**
 * The reading scene: someone reading, and what reading does to a scattered head.
 *
 * Drawn, not filmed. A video would mean a file of several megabytes on a first
 * paint, over Indian mobile data, for decoration — and the strategy document
 * commits to a zero-data tier. This is a few hundred bytes of SVG that scales
 * to any screen and costs nothing to download.
 *
 * It is original geometry on purpose: no character, no likeness, no borrowed
 * illustration. A figure made of a circle and two arcs cannot be mistaken for
 * anyone, which is the point.
 *
 * The idea it carries, which is the product's whole claim: the motes leave the
 * page scattered and arrive ordered. Noise in, one next thing out.
 *
 * aria-hidden because it says nothing a screen-reader user needs; the sentence
 * beside it carries the meaning. All motion is transform and opacity, and
 * index.css turns it off under prefers-reduced-motion, leaving the motes where
 * they resolve rather than where they start — a still frame of the end state,
 * not of the mess.
 */
export function ReadingScene() {
  // Fixed, not random. A scene that lands differently on every render reads as
  // a bug; these were placed by eye and then left alone.
  const motes = [
    { x: 92, d: 0, r: 2.6 },
    { x: 120, d: 900, r: 2 },
    { x: 150, d: 400, r: 3 },
    { x: 176, d: 1600, r: 2.2 },
    { x: 205, d: 1150, r: 2.6 },
    { x: 232, d: 2100, r: 1.8 },
    { x: 60, d: 2600, r: 2.2 },
  ]

  return (
    <svg
      viewBox="0 0 300 260"
      className="scene h-auto w-full max-w-[13rem] sm:max-w-[18rem] lg:max-w-[22rem]"
      aria-hidden
      focusable="false"
    >
      {/* What the reading resolves into: three ordered rules, drawn in the
          accent. Deliberately three, and deliberately one length each. */}
      <g className="scene-order" stroke="var(--color-accent)" strokeLinecap="round">
        <line x1="112" y1="34" x2="188" y2="34" strokeWidth="3" />
        <line x1="124" y1="48" x2="176" y2="48" strokeWidth="2.5" opacity="0.72" />
        <line x1="136" y1="61" x2="164" y2="61" strokeWidth="2" opacity="0.5" />
      </g>

      {/* The scatter on its way up. Each one rises on its own clock. */}
      <g fill="var(--color-accent)">
        {motes.map((m) => (
          <circle
            key={m.x}
            className="mote"
            cx={m.x}
            cy="150"
            r={m.r}
            // --mote-x is what makes the drift read as sorting rather than
            // floating: each mote pulls toward the centre in proportion to how
            // far from it it started.
            style={{ animationDelay: `${m.d}ms`, '--mote-x': `${m.x}px` } as CSSProperties}
          />
        ))}
      </g>

      {/* The reader. A head, a shoulder line, two hands holding a book open. */}
      <g stroke="var(--color-ink)" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="150" cy="176" r="15" strokeWidth="2.5" />
        <path d="M112 236a38 30 0 0 1 76 0" strokeWidth="2.5" />
        {/* The book, seen from the reader's side: two leaves meeting at a spine. */}
        <g className="scene-book">
          <path d="M150 214 L96 206 a6 6 0 0 1 -4-6 L92 178 l58 10 Z" strokeWidth="2.2" fill="var(--color-surface)" />
          <path d="M150 214 L204 206 a6 6 0 0 0 4-6 L208 178 l-58 10 Z" strokeWidth="2.2" fill="var(--color-surface)" />
          {/* The page that is mid-turn. Slow, and only ever one. */}
          <path className="scene-page" d="M150 214 L150 188 l50-9 L200 200 a6 6 0 0 1 -4 6 Z"
            strokeWidth="1.6" fill="var(--color-paper)" opacity="0.9" />
        </g>
        <line x1="150" y1="188" x2="150" y2="214" strokeWidth="2.2" />
      </g>
    </svg>
  )
}
