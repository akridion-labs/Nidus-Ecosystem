/**
 * Install the native bindings for a platform that is not the one node_modules
 * was installed on.
 *
 * WHY THIS EXISTS
 *
 * One node_modules folder, two machines. The repo lives in a folder that is
 * mounted on Deepak's Mac (darwin-arm64) and on the Linux arm64 VM that builds
 * it. Vite 8 (rolldown), Tailwind 4 (oxide), lightningcss and oxlint are all
 * native, and npm installs only the current platform's binding — it creates
 * EMPTY directories for the others (npm/cli#4828). So whichever machine ran
 * `npm install` last works, and the other one fails with:
 *
 *   Error: Cannot find native binding.
 *   ... Please try `npm i` again after removing both package-lock.json and
 *   node_modules directory.
 *
 * Following that advice is the trap: it fixes the machine you ran it on and
 * breaks the other one, forever, alternately. The actual fix is to have BOTH
 * platforms' bindings present — they sit side by side and each runtime picks
 * its own, because that is exactly what optionalDependencies are for.
 *
 *   node tools/add-platform-bindings.mjs darwin-arm64
 *   node tools/add-platform-bindings.mjs linux-arm64-gnu
 *
 * It reads the installed version of each package so the binding can never
 * drift from the package it belongs to, and it skips anything already present.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const target = process.argv[2]
if (!target) {
  console.error('usage: node tools/add-platform-bindings.mjs <platform>   e.g. darwin-arm64')
  process.exit(1)
}

// [parent package, how that family names its binding package]
const FAMILIES = [
  ['rolldown', (p) => `@rolldown/binding-${p}`],
  ['oxlint', (p) => `@oxlint/binding-${p}`],
  ['@tailwindcss/oxide', (p) => `@tailwindcss/oxide-${p}`],
  ['lightningcss', (p) => `lightningcss-${p}`],
]

const version = (pkg) =>
  JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, 'utf8')).version

let added = 0
for (const [parent, name] of FAMILIES) {
  let v
  try { v = version(parent) } catch { console.log(`- ${parent} not installed, skipping`); continue }
  const binding = name(target)
  const dest = `node_modules/${binding}`
  let existing = []
  try { existing = readdirSync(dest) } catch { /* not even the empty dir */ }
  if (existing.length > 0) { console.log(`= ${binding} already present`); continue }

  const tmp = mkdtempSync(join(tmpdir(), 'nidus-binding-'))
  try {
    const out = execFileSync('npm', ['pack', `${binding}@${v}`], { cwd: tmp, encoding: 'utf8' })
    const tgz = out.trim().split('\n').at(-1)
    execFileSync('tar', ['-xzf', tgz, '-C', tmp], { cwd: tmp })
    cpSync(join(tmp, 'package'), dest, { recursive: true })
    console.log(`+ ${binding}@${v}`)
    added++
  } catch (e) {
    // A platform a package does not publish for is not an error worth stopping
    // on — the next family may well have it.
    console.log(`! ${binding}@${v} could not be fetched: ${String(e.message).split('\n')[0]}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
console.log(added === 0 ? 'nothing to add' : `${added} binding(s) added for ${target}`)
