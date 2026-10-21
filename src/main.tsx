import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SignIn } from './SignIn.tsx'

/**
 * Preview switches, for looking at screens that are not reachable yet.
 *
 *   npm run dev   →   http://localhost:5173/?preview=signin
 *
 * `import.meta.env.DEV` becomes the literal `false` at build time, so this
 * branch is dead code in production and rollup drops it along with the SignIn
 * module. The published page cannot reach it even by guessing the URL. That is
 * a build-time guarantee rather than a convention somebody has to remember,
 * which is the only kind worth having for a screen that looks like a login —
 * and `tests/preview.test.ts` greps the built bundle to prove it every run,
 * because "tree-shaking will handle it" is an assumption until something checks.
 *
 * This is NOT an admin role and must not grow into one. A privilege flag that
 * lives in the client is security theatre: the bundle ships to every visitor,
 * so anything it checks, a visitor can read and flip from the console in about
 * ten seconds. DR-009 settled the real shape — the master login is a role on
 * Deepak's own account, checked on the SERVER on every request, never a
 * separate door and never a client-side boolean. What was wanted here was "let
 * me load the page and look at it", and that is all this does.
 */
const previewSignIn =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'signin'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {previewSignIn ? <SignIn /> : <App />}
  </StrictMode>,
)
