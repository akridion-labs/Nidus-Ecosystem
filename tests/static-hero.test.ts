import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * index.html carries a static copy of the cold open so the page paints before
 * any JavaScript runs. Two copies of one sentence is a drift waiting to
 * happen, and the failure is silent: the visitor reads one headline and then
 * watches it change. This is the thing that notices.
 */
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('the static hero headline matches the one React renders', () => {
  // Two copies of one sentence is a drift waiting to happen, and the failure
  // is silent: the visitor reads one headline and watches it change when the
  // bundle boots. The headline moved from a situation to the product's own
  // question when the page got a front door; this follows it.
  const rendered = /className="display rise mt-10[^"]*"\s*\n[^>]*>\s*\n?\s*([^<\n]+)/.exec(app)?.[1]?.trim()
  assert.ok(rendered, 'could not find the rendered headline in App.tsx')
  assert.ok(
    html.includes(rendered),
    `index.html must contain the rendered headline verbatim.\n  expected: ${rendered}`,
  )
})

test('the static hero paragraph matches the one React renders', () => {
  // The headline was checked and the paragraph was not, so the paragraph drifted:
  // index.html carried one sentence and React swapped in three on mount. Nobody
  // saw it in a screenshot, because a screenshot is taken after mount.
  const rendered = /className="rise mt-5 max-w-\[52ch\][^"]*"[\s\S]{0,120}?>\s*([\s\S]*?)\s*<\/p>/
    .exec(app)?.[1]
  assert.ok(rendered, 'could not find the rendered hero paragraph in App.tsx')
  const flat = (t: string) => t.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  assert.ok(
    flat(html).includes(flat(rendered)),
    `index.html must contain the rendered hero paragraph.\n  expected: ${flat(rendered)}`,
  )
})

test('the static hero is inside #root so React replaces it cleanly', () => {
  const root = /<div id="root">([\s\S]*?)\n    <\/div>/.exec(html)
  assert.ok(root, '#root must contain the static markup')
  assert.ok(root[1].includes('<h1'), 'the headline must be inside #root')
})

test('the hero layout matches too, so nothing jumps when the bundle boots', () => {
  // Matching the words is not enough once the hero has a shape. React draws the
  // reading scene beside the question; index.html must hold that space, or the
  // headline moves under the visitor the moment the bundle parses.
  for (const cls of ['grid items-center gap-8 lg:grid-cols-12', 'lg:col-span-7', 'lg:col-span-5']) {
    assert.ok(app.includes(cls), `App.tsx lost the hero layout class "${cls}"`)
    assert.ok(html.includes(cls), `index.html must reserve the same hero layout: "${cls}"`)
  }
  assert.match(html, /aspect-ratio:\s*300\/260/,
    'index.html must reserve the reading scene\'s aspect ratio')
})

test('night is chosen by the clock, not by guesswork', async () => {
  const { nightByDefault } = await import('../src/App.tsx').catch(() => ({ nightByDefault: null }))
  // App.tsx imports CSS and React, so it cannot be loaded in node:test. The
  // rule is asserted against the source instead: the boundary must be 20:00
  // and 06:00, because a theme that flips at the wrong hour is the kind of
  // bug nobody files and everybody notices.
  if (nightByDefault) return
  assert.match(app, /hour >= 20 \|\| hour < 6/)
})
