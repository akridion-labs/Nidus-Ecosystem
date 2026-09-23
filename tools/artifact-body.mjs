/**
 * Build the Artifact-ready fragment: the published page has no <html>/<head>
 * of its own, so style, body and script are spliced together by hand.
 *
 * Vite emits the module script into <head>, so an earlier version of this that
 * took only <body> silently shipped a 25 kB page with the static hero and no
 * application at all. The assertions below are the whole point of the file.
 */
import { readFileSync, writeFileSync } from 'node:fs'
const [src, out] = process.argv.slice(2)
const html = readFileSync(src, 'utf8')

const style = html.match(/<style>[\s\S]*?<\/style>/)?.[0]
const script = html.match(/<script type="module">[\s\S]*?<\/script>/)?.[0]
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1]
if (!style || !script || !body) throw new Error('missing style, script or body')

const fragment = `${style}\n${body.replace(/<script[\s\S]*?<\/script>/g, '').trim()}\n${script}\n`

if (!/id="root"/.test(fragment)) throw new Error('no #root in the fragment')
if (!/createRoot|StrictMode|useState/.test(fragment)) throw new Error('the application bundle is missing')
if (fragment.length < 200_000) throw new Error(`fragment is only ${(fragment.length / 1024) | 0} kB — the bundle did not make it`)

writeFileSync(out, fragment)
console.log(`artifact fragment: ${(fragment.length / 1024) | 0} kB`)
