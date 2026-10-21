import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'

/**
 * The preview switch must never reach a real visitor.
 *
 * `main.tsx` renders the sign-in screen only under `import.meta.env.DEV`, which
 * Vite replaces with the literal `false` in a production build, so the branch
 * is dead code and rollup drops the module with it. That is the theory. This is
 * the thing that checks it, because "tree-shaking will handle it" is an
 * assumption until something greps the output — and the cost of being wrong is
 * a login-shaped screen on a public URL that signs nobody in.
 */
const dist = new URL('../.vite-out/assets/', import.meta.url)

test('the production bundle contains no sign-in screen', { skip: !existsSync(dist) && 'run `npm run build:single` first' }, () => {
  const js = readdirSync(dist).filter((f) => f.endsWith('.js'))
  assert.ok(js.length > 0, 'no bundle found to check')
  const code = js.map((f) => readFileSync(new URL(f, dist), 'utf8')).join('\n')

  for (const marker of [
    'Verify and keep my shelf',
    'Continue with Google',
    'Send me a code',
    'Keep what you have read',
  ]) {
    assert.ok(!code.includes(marker),
      `the built bundle contains "${marker}" — the preview reached production`)
  }
  // And the switch itself is gone, not merely unreachable.
  assert.ok(!code.includes('preview=signin') && !code.includes("'signin'"),
    'the preview switch survived into the production bundle')
})

test('the preview is guarded by a build-time constant, not a runtime flag', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  assert.match(main, /import\.meta\.env\.DEV/,
    'the preview guard must be import.meta.env.DEV so the branch is removed at build time')
  // A client-side privilege flag is security theatre: the bundle ships to every
  // visitor. DR-009 puts the master login on the server, as a role.
  for (const smell of ['isAdmin', 'role === "admin"', "role === 'admin'", 'ADMIN_PASSWORD', 'adminToken']) {
    assert.ok(!main.includes(smell), `main.tsx contains "${smell}" — admin checks do not belong in the client`)
  }
})
