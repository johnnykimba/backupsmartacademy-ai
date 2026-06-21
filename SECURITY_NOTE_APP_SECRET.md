# APP_SECRET — Known Limitation (Documented, Not Fixed)

## What it is
`APP_SECRET` is a static string sent with every request from the
frontend to the Cloudflare Worker, checked server-side as a basic
"is this request coming from our actual frontend" signal.

## The issue
It's hardcoded as a plain string in client-side JavaScript
(`index.html`), e.g.:
  `var APP_SECRET = 'sWN-...';`
Anyone can read this value via browser dev tools / View Source.

## Why it can't be fully fixed on a static site
This is a static, client-only website (GitHub Pages, no backend
rendering). Any value the browser needs to send to the worker must
be readable by that same browser — there is no way to deliver a
truly hidden secret to a static page. This is a structural
limitation of the architecture, not a mistake that can be patched
away without adding a real backend auth step (e.g. per-session
tokens issued after a valid access-code check).

## Practical risk (lower than it sounds)
- Does NOT expose: OpenAI/Anthropic API keys, KV contents, payment
  data, or the admin panel — those have their own separate checks.
- DOES allow: someone could write a script that calls the worker
  directly using this same secret, bypassing the actual website UI.
- Existing backstop: the worker already tracks and limits cost
  per access code (COST_LIMIT_PCT in KV), which caps how much
  damage any single code/script could do even with this secret.

## Decision (June 2026)
Documented and accepted as a known, low-priority limitation rather
than fixed. Revisit if abuse patterns are ever observed, at which
point worker-side rate limiting or per-session tokens would be the
real fix — not further attempts to hide this string.
