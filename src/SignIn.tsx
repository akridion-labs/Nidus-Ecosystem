import { ReadingScene } from './brand/ReadingScene.tsx'
import { Wordmark } from './brand/Wordmark.tsx'

/**
 * The sign-in screen, as a real component rather than a throwaway mockup.
 *
 * WHY IT IS INERT
 *
 * Every control here is `disabled`. Nothing submits, nothing is stored, no
 * network call exists. That is deliberate and not laziness: authentication is
 * not built (DR-009), and a sign-in form that LOOKS live while going nowhere is
 * the one kind of screen this product must never ship. Someone would type a
 * real password into it.
 *
 * WHY IT IS DEV-ONLY
 *
 * `main.tsx` renders this only under `import.meta.env.DEV`, so it is tree-shaken
 * out of the production bundle entirely — the published page cannot reach it
 * even by guessing the URL. That is a build-time guarantee rather than a
 * convention somebody has to remember.
 *
 * WHY THERE IS NO ADMIN ROLE HERE
 *
 * An "admin" flag in the client would be security theatre. The bundle ships to
 * every visitor; anything it checks, a visitor can read and flip in about ten
 * seconds with the devtools console. DR-009 already settled the real shape:
 * the master login is a ROLE ON DEEPAK'S OWN ACCOUNT, checked server-side on
 * every request, never a separate door and never a client-side boolean. What
 * was actually wanted — "let me load the page and look at it" — is a preview
 * switch, which is what this is.
 */
export function SignIn() {
  return (
    <div className="min-h-dvh bg-paper">
      <div className="livewash" aria-hidden><span /><span /><span /></div>

      <div className="relative z-[1] mx-auto max-w-[72rem] px-4 pt-10 pb-16 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Wordmark />
          <p className="label-caps rounded-full border border-amber bg-amber-soft px-3 py-1 text-amber">
            Preview · not built · nothing here signs anyone in
          </p>
        </div>

        <div className="mt-12 grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <h1 className="display rise text-[clamp(2.1rem,5vw,3rem)]">Keep what you have read.</h1>
            <p className="rise mt-5 max-w-[40ch] text-muted" style={{ animationDelay: '90ms' }}>
              Nidus works without an account and always will. An account exists for one reason: so
              it stops offering you books you have already finished — and so it can ask you for{' '}
              <em>less</em> next time, not more.
            </p>
            <div className="rise mt-8 flex justify-center lg:justify-start" style={{ animationDelay: '190ms' }}>
              <ReadingScene />
            </div>
          </div>

          <div className="rise lg:col-span-4" style={{ animationDelay: '140ms' }}>
            <p className="label-caps mb-3 text-muted">Step 1 — pick a door</p>
            <div className="rounded-2xl border border-line bg-surface p-6">
              <button type="button" disabled className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface text-[16px] font-semibold">
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.6 5.9c4.4-4.1 6.7-10.1 6.7-17.4z" />
                  <path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.3 0 20 0 24s.9 7.7 2.6 10.8l7.8-6.1z" />
                  <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.4-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.8 2.3-6.4 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
                </svg>
                Continue with Google
              </button>

              <div className="my-5 flex items-center gap-3 text-[14px] text-muted">
                <span className="h-px grow bg-line" />or<span className="h-px grow bg-line" />
              </div>

              <label className="block">
                <span className="text-[15px] font-medium">Phone number</span>
                <span className="mt-2 flex gap-2">
                  <span className="flex min-h-12 w-[4.5rem] items-center justify-center rounded-lg border border-line bg-paper text-muted">+91</span>
                  <input
                    type="tel"
                    disabled
                    placeholder="98765 43210"
                    className="min-h-12 grow rounded-lg border border-line bg-paper px-3 text-[16px] placeholder:text-muted/70"
                  />
                </span>
              </label>

              <button type="button" disabled className="mt-4 min-h-12 w-full rounded-xl bg-accent text-[16px] font-semibold text-surface">
                Send me a code
              </button>

              <p className="mt-3 text-[14px] text-muted">
                A code by SMS. Nidus would store the number only after the code checks out, and
                delete it whenever you ask.
              </p>
              <p className="mt-4 text-center text-[15px] text-muted underline decoration-line underline-offset-4">
                Keep reading without an account
              </p>
            </div>
          </div>

          <div className="rise lg:col-span-4" style={{ animationDelay: '230ms' }}>
            <p className="label-caps mb-3 text-muted">Step 2 — the code</p>
            <div className="rounded-2xl border border-line bg-surface p-6">
              <p className="text-[15px] font-medium">Code sent to +91 98765 43210</p>
              <div className="mt-2 flex gap-2">
                {['4', '0', '7', '2', '', ''].map((d, i) => (
                  <span
                    key={i}
                    className={`book-voice flex aspect-[3/4] max-w-[46px] grow items-center justify-center rounded-lg border bg-paper text-[22px] ${
                      i === 3 ? 'border-accent ring ring-accent' : 'border-line'
                    }`}
                  >
                    {d}
                  </span>
                ))}
              </div>
              <button type="button" disabled className="mt-5 min-h-12 w-full rounded-xl bg-accent text-[16px] font-semibold text-surface">
                Verify and keep my shelf
              </button>
              <p className="mt-3 text-[14px] text-muted">Did not arrive? Resend in 0:24.</p>

              <div className="mt-5 rounded-xl border border-dashed border-line p-4 text-[14px] leading-snug text-muted">
                <p><span className="font-medium text-ink">What Nidus would keep:</span> the books you marked finished or reading, and whichever of Google or your number you signed in with.</p>
                <p className="mt-3"><span className="font-medium text-ink">What it would never keep:</span> your contacts, your location, anything you did not type in — and nothing at all if you use it without an account.</p>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-12 max-w-[62ch] rounded-xl border border-amber bg-amber-soft p-4 text-[14px]">
          <strong className="font-medium">This screen is a design preview and does not work.</strong>{' '}
          Every control on it is disabled, nothing is submitted and nothing is stored, because
          authentication is not built. It is served only by the development server and is removed
          from the production build entirely. Before any of this is real, two things must land
          first: the client wired to the server, and <code>/privacy</code> with a deletion flow.
          Signing in to a page that forgets you is a form with no payoff.
        </p>
      </div>
    </div>
  )
}
