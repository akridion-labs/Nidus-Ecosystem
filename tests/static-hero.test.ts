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

test('the static hero headline matches OPENINGS[0]', () => {
  const first = /id: 'decision',\s*\n\s*line: '([^']+)'/.exec(app)?.[1]
  assert.ok(first, 'could not find the first opening in App.tsx')
  assert.ok(
    html.includes(first),
    `index.html must contain the first opening verbatim.\n  expected: ${first}`,
  )
})

test('the static hero is inside #root so React replaces it cleanly', () => {
  const root = /<div id="root">([\s\S]*?)\n    <\/div>/.exec(html)
  assert.ok(root, '#root must contain the static markup')
  assert.ok(root[1].includes('<h1'), 'the headline must be inside #root')
})
