// Viewport + accessibility audit. Needs playwright-core and axe-core, which are
// not dependencies of this project — run it wherever those exist, pointing at a
// built dist/ served over http (file:// will not load the module bundle).
//
// Two things here were learned the hard way and are the whole reason this file
// exists rather than a one-liner someone retypes each time:
//
// 1. Horizontal overflow is measured with window.scrollX after an attempted
//    scroll, NEVER with documentElement.scrollWidth. scrollWidth counts the
//    content of a scrolling descendant — the shelf of spines is 1049px wide
//    inside a 356px scroller — so it reads ~1070 on a 430px viewport while the
//    page does not scroll at all. A scrollWidth check reports a bug that is
//    not there, and the fix for it would be to break the shelf.
//
// 3. WCAG 2.5.8 has an "Inline" exception: a target inside a sentence, sized by
//    the line-height of the text around it, is exempt from the 24px minimum.
//    Without that exception a probe reports every underlined word in a
//    paragraph as a failure - and the "fix" is to pull the link out of the
//    prose, which makes the page worse to satisfy a rule that does not apply.
//    It showed up on "Put it back" in the auto-night sentence, which only
//    renders after 20:00, so it had been invisible to every earlier run.
// 2. One browser per viewport width. Chromium keeps vmax-sized fixed-layer
//    metrics from a previous viewport in the same process, so whichever width
//    runs second shows a phantom 16-24px of horizontal scroll on the livewash.
//    Measured: first width always clean, second always dirty, either order.
import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const root = process.argv[2] ?? 'dist'
const chrome = process.env.CHROME_PATH
const axeSrc = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
const srv = createServer(async (req, res) => {
  const q = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]
  try {
    const buf = await readFile(root + decodeURIComponent(q))
    res.setHeader('content-type', types[q.slice(q.lastIndexOf('.'))] ?? 'application/octet-stream')
    res.end(buf)
  } catch { res.statusCode = 404; res.end('no') }
}).listen(8099)

const probeTargets = (p) => p.evaluate(() => {
  const inlineExempt = (el) => {
    const parent = el.parentElement
    // `el.tagName === 'A'` used to sit in this guard, which disabled the
    // exemption for the one element WCAG 2.5.8's Inline exception is mostly
    // about: a link inside a sentence. Every target it reported was an <a> in
    // prose, and the "fix" each time would have been to pull the link out of
    // the paragraph and make the page worse. Worse, the noise hid a REAL
    // failure: a citation anchor that is the whole paragraph rather than a
    // word in one, and so is not exempt at all.
    if (!parent) return false
    // inline-block as well as inline: a <button> in a sentence is inline-block
    // by default, which is the "Put it back" case noted above.
    if (!['inline', 'inline-block'].includes(getComputedStyle(el).display)) return false
    if (!['P', 'LI', 'SPAN'].includes(parent.tagName)) return false
    // The exemption is for a target IN a sentence. An anchor that is the
    // entire paragraph is a standalone target wearing prose clothing.

    const around = (parent.textContent || '').trim().length
    const own = (el.textContent || '').trim().length
    return around > own + 20
  }
  return [...document.querySelectorAll('button,a,input,summary,[tabindex="0"]')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ el, r }) =>
      r.width > 0 && r.height > 0 && (r.height < 24 || r.width < 24) &&
      !el.closest('.shelf-row') && getComputedStyle(el).position !== 'absolute' &&
      !inlineExempt(el))
    .map(({ el, r }) => `${el.tagName}:${(el.textContent || '').trim().slice(0, 22)}:${Math.round(r.width)}x${Math.round(r.height)}`)
    .slice(0, 6)
})

const hscroll = (p) => p.evaluate(() => {
  const y = window.scrollY
  window.scrollTo(9999, y)
  const x = window.scrollX
  window.scrollTo(0, y)
  return x
})

let bad = 0
/**
 * The eleven widths the project has been claiming in commit messages and the
 * status doc, which the committed tool did not actually run — it ran three.
 * Override with: node tools/viewport-audit.mjs <root> 430,1440
 */
const WIDTHS = process.argv[3]
  ? process.argv[3].split(',').map(Number)
  : [320, 360, 390, 414, 430, 768, 834, 932, 1024, 1440, 1920]

for (const w of WIDTHS) {
  const b = await chromium.launch(chrome ? { executablePath: chrome } : {})
  const p = await b.newPage({ viewport: { width: w, height: 932 } })
  await p.goto('http://127.0.0.1:8099/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(300)
  const scroll = { landing: await hscroll(p) }
  await p.getByRole('button', { name: '#buildacompany' }).click()
  await p.waitForTimeout(300)
  scroll.ladder = await hscroll(p)
  await p.getByRole('button', { name: 'Start here tonight' }).click()
  await p.waitForTimeout(900)
  scroll.result = await hscroll(p)
  await p.locator('.shelf-row button').nth(3).click()
  await p.waitForTimeout(300)
  scroll.spine = await hscroll(p)
  await p.addScriptTag({ content: axeSrc })
  const violations = await p.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    })
    return r.violations.map((v) => ({ id: v.id, nodes: v.nodes.length }))
  })
  const tiny = await probeTargets(p)
  const scrolled = Object.entries(scroll).filter(([, x]) => x !== 0)
  if (scrolled.length > 0 || violations.length > 0 || tiny.length > 0) bad++
  console.log(w, JSON.stringify(scroll), 'axe', JSON.stringify(violations),
    tiny.length > 0 ? `tiny:${tiny.join(',')}` : '')
  await b.close()
}
srv.close()
console.log(bad === 0 ? `clean across ${WIDTHS.length} widths` : `${bad} of ${WIDTHS.length} width(s) failed`)
process.exitCode = bad === 0 ? 0 : 1
