import type { CatalogueItem } from '../domain/catalogue.ts'

/**
 * A drawn spine, never a cover image — real covers are someone else's
 * copyright, and this project does not borrow what it has not got.
 *
 * Everything comes from the book's own record, deterministically, so the same
 * book is the same colour forever and no data needs to be stored:
 *   hue    — a hash of the work id
 *   height — page count where known, difficulty otherwise
 *   width  — page count where known, a default otherwise
 *
 * Saturation and lightness are clamped to a narrow band on purpose. Free hue
 * with free saturation gives a paint chart; clamped, it gives a row of cloth
 * bindings, which is what a shelf is supposed to look like.
 */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xffffffff
}

export function Spine({ item, tall = false }: { item: CatalogueItem; tall?: boolean }) {
  const h = hash(item.work.id)
  const pages = item.editions.find((e) => e.pages)?.pages ?? null
  const bulk = pages ? Math.min(pages / 400, 1.4) : 0.55 + item.profile.conceptualDifficulty / 10

  const hue = Math.round(h * 360)
  const sat = 22 + Math.round(hash(item.work.author) * 16)   // 22–38%
  const light = 26 + Math.round(item.profile.conceptualDifficulty * 2.2) // darker = denser

  const base = tall ? 190 : 132
  return (
    <div
      className="spine shrink-0"
      style={{
        width: `${Math.round(22 + bulk * 16)}px`,
        height: `${Math.round(base * (0.88 + h * 0.22))}px`,
        background: `linear-gradient(100deg, hsl(${hue} ${sat}% ${light}%), hsl(${hue} ${sat}% ${light + 6}%))`,
      }}
      title={`${item.work.title} — ${item.work.author}`}
    >
      <span className="spine-label text-[12px]">{item.work.title}</span>
    </div>
  )
}
