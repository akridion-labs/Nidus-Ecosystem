// ponytail: 20 lines instead of vite-plugin-singlefile. Upgrade to the plugin
// if the build ever needs code-splitting or more than one entry chunk.
//
// Replacements pass a FUNCTION, never a string: a minified React bundle
// contains $& and $' sequences, and String.replace would treat those as
// back-references and splice the rest of the document back into itself.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
const dir = process.argv[2]
let html = readFileSync(`${dir}/index.html`, 'utf8')
for (const f of readdirSync(`${dir}/assets`)) {
  const body = readFileSync(`${dir}/assets/${f}`, 'utf8')
  if (f.endsWith('.js')) {
    html = html.replace(new RegExp(`<script[^>]*src="[^"]*${f}"[^>]*></script>`),
      () => `<script type="module">${body}</script>`)
  } else if (f.endsWith('.css')) {
    html = html.replace(new RegExp(`<link[^>]*href="[^"]*${f}"[^>]*>`), () => `<style>${body}</style>`)
  }
}
// Nothing may be fetched from the network once this page is published.
html = html.replace(/<link rel="icon"[^>]*>/, '')
if (/src="\/|href="\/assets/.test(html)) throw new Error('an asset reference survived inlining')
writeFileSync(`${dir}/nidus-pilot.html`, html)
console.log('inlined:', (html.length / 1024).toFixed(0), 'kB')
