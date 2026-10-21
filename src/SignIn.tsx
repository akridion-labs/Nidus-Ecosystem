import { useEffect, useState } from 'react'
import { ReadingScene } from './brand/ReadingScene.tsx'
import { Wordmark } from './brand/Wordmark.tsx'

/**
 * Sign in with Google. This one works.
 *
 * The button is a real link to the server's `/api/auth/google/start`, which
 * redirects to Google with PKCE, takes the callback, and sets the same session
 * cookie the rest of the API already uses. Nothing here is a placeholder.
 *
 * What it will NOT do is pretend. The server says whether Google is configured
 * (`/api/auth/config`), and this page renders one of three honest states:
 *
 *   - server reachable and configured   -> a live button
 *   - server reachable, not configured  -> disabled, naming the exact env vars
 *   - server unreachable                -> disabled, saying to start the server
 *
 * A sign-in button that looks live and goes nowhere is the worst control this
 * product could ship, because somebody types a real password into it. Three
 * states is the cost of never shipping that one.
 *
 * Phone + OTP is not built. The server reports `phoneOtp: false` and this
 * renders it as plainly unavailable rather than as a second dead button.
 */

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

type AuthConfig = { google: boolean; missing: string[]; phoneOtp: boolean }
type State =
  | { kind: 'loading' }
  | { kind: 'ready'; config: AuthConfig }
  | { kind: 'offline' }

/** `?signin=ok|failed|cancelled`, set by the server's callback redirect. */
function outcomeFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('signin')
}

export function SignIn() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [me, setMe] = useState<{ id: string } | null>(null)
  const outcome = outcomeFromUrl()

  useEffect(() => {
    let live = true
    fetch(`${API}/api/auth/config`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((config: AuthConfig) => { if (live) setState({ kind: 'ready', config }) })
      .catch(() => { if (live) setState({ kind: 'offline' }) })
    // Whether we are already signed in is a fact the server owns, so ask it
    // rather than inferring from a cookie this page cannot read anyway.
    fetch(`${API}/api/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (live && body) setMe(body) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  const googleLive = state.kind === 'ready' && state.config.google

  return (
    <div className="min-h-dvh bg-paper">
      <div className="livewash" aria-hidden><span /><span /><span /></div>

      <div className="relative z-[1] mx-auto max-w-[72rem] px-4 pt-10 pb-16 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Wordmark />
          <a href="/" className="label-caps min-h-11 rounded-lg border border-line px-3 py-2 text-muted hover:border-accent hover:text-ink">
            Back to Nidus
          </a>
        </div>

        {/* What just happened, if anything. */}
        {outcome !== null && (
          <p
            role="status"
            className={`mt-8 max-w-[62ch] rounded-xl border p-4 text-[15px] ${
              outcome === 'ok' ? 'border-accent bg-accent-soft' : 'border-amber bg-amber-soft'
            }`}
          >
            {outcome === 'ok' && 'Signed in. Your shelf will follow you to this browser from now on.'}
            {outcome === 'cancelled' && 'Sign-in cancelled at Google. Nothing was stored, and Nidus still works without an account.'}
            {outcome === 'failed' && 'That sign-in did not complete. Nothing was stored. Try again, and if it keeps happening the server log has the detail.'}
          </p>
        )}

        <div className="mt-10 grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <h1 className="display rise text-[clamp(2.1rem,5vw,3rem)]">
              {me ? 'You are signed in.' : 'Keep what you have read.'}
            </h1>
            <p className="rise mt-5 max-w-[42ch] text-muted" style={{ animationDelay: '90ms' }}>
              {me
                ? 'Nidus now remembers which books you have finished, so it will stop offering them back to you. Nothing else about you is stored.'
                : <>Nidus works without an account and always will. An account exists for one reason: so it stops offering you books you have already finished — and so it can ask you for <em>less</em> next time, not more.</>}
            </p>
            <div className="rise mt-8 flex justify-center lg:justify-start" style={{ animationDelay: '190ms' }}>
              <ReadingScene />
            </div>
          </div>

          <div className="rise lg:col-span-7" style={{ animationDelay: '140ms' }}>
            <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
              {state.kind === 'loading' && (
                <p className="text-[15px] text-muted">Asking the server what it can do…</p>
              )}

              {state.kind === 'offline' && (
                <div>
                  <p className="font-medium">The Nidus server is not answering.</p>
                  <p className="mt-2 max-w-[54ch] text-[15px] text-muted">
                    Sign-in needs it, because the whole point of an account is a record that
                    outlives this tab. Start it and reload:
                  </p>
                  <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-paper p-3 text-[13px]">npm run migrate{'\n'}npm run server</pre>
                  <p className="mt-2 text-[14px] text-muted">
                    Looked for it at <code>{API}</code>. Set <code>VITE_API_URL</code> if it runs elsewhere.
                  </p>
                </div>
              )}

              {state.kind === 'ready' && (
                <>
                  {googleLive ? (
                    <a
                      href={`${API}/api/auth/google/start`}
                      className="transition-ui flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface text-[16px] font-semibold hover:border-accent active:scale-[0.97]"
                    >
                      <GoogleMark />
                      {me ? 'Switch Google account' : 'Continue with Google'}
                    </a>
                  ) : (
                    <div>
                      <button type="button" disabled className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-line bg-paper text-[16px] font-semibold text-muted">
                        <GoogleMark />
                        Continue with Google
                      </button>
                      <p className="mt-3 max-w-[54ch] text-[15px] text-muted">
                        Not configured yet, so this button is disabled rather than pretending.
                        Nidus needs an OAuth client of its own — about five minutes in the Google
                        Cloud console, and only you can create it. Missing:
                      </p>
                      <ul className="mt-2 space-y-1">
                        {state.config.missing.map((k) => (
                          <li key={k} className="text-[14px]"><code>{k}</code></li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[14px] text-muted">
                        The steps are written out in <code>.env.example</code>. Fill them into
                        <code> .env.local</code> and restart the server.
                      </p>
                    </div>
                  )}

                  <div className="my-6 flex items-center gap-3 text-[14px] text-muted">
                    <span className="h-px grow bg-line" />or<span className="h-px grow bg-line" />
                  </div>

                  <div className="rounded-xl border border-dashed border-line p-4">
                    <p className="font-medium">A phone number and a code</p>
                    <p className="mt-2 max-w-[54ch] text-[15px] text-muted">
                      Decided and not built (DR-009). It matters because a large part of the
                      readers Nidus is for have a phone and no Google account signed in on the
                      device, and Google-only quietly selects for the audience that is easiest to
                      serve. It needs a Firebase project, and it needs <code>/privacy</code> to
                      name a phone number before Nidus may hold one.
                    </p>
                  </div>

                  <p className="mt-6 text-[14px] leading-snug text-muted">
                    <span className="font-medium text-ink">What signing in stores:</span> which books
                    you marked finished or reading, and the Google subject id — a meaningless string
                    identifying you to Nidus and nothing else.{' '}
                    <span className="font-medium text-ink">What it does not:</span> your email, your
                    contacts, your location. Nidus does not ask Google for your email address at all.
                  </p>
                </>
              )}
            </div>

            <p className="mt-4 max-w-[62ch] text-[14px] text-muted">
              <code>/privacy</code> and a deletion page do not exist yet, which is why this screen is
              reachable only from a development server. They land before anyone but you signs in.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.6 5.9c4.4-4.1 6.7-10.1 6.7-17.4z" />
      <path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.3 0 20 0 24s.9 7.7 2.6 10.8l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.4-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.8 2.3-6.4 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}
