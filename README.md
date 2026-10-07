# Proof Bridge frontend

First vertical slice of the merchant dispute response flow. React + Vite + TypeScript, React Router, TanStack Query, Lucide icons and custom Razorpay-inspired mobile styling. Blade is not installed; the small visual shell uses local CSS to avoid blocking this slice. This is a prototype, not an official Razorpay app.

## Run locally

Requires Node.js 22.12 or later.

```sh
npm install
npm run dev
npm test
npm run build
```

Open **http://localhost:5173**. Use localhost rather than 127.0.0.1: the live backend currently permits localhost:5173 through CORS and rejects 127.0.0.1:5173. The Vite server listens only on the local machine.

If Node is not on your shell's PATH, this machine has Node in `/Users/harshil/.nvm/versions/node/v24.21.0/bin`; enable your existing nvm installation before running the commands.

The API defaults to `https://proof-bridge-api.onrender.com/api/v1`. Copy `.env.example` to `.env.local` to override `VITE_API_BASE_URL`. Only the public API URL belongs here. Never put Razorpay keys, demo secrets or signing keys in VITE variables.

## Secure alert flow

Open `/d/<dispute_id>?t=<fresh_link_token>` from a backend-generated alert. The app immediately removes `t` with `history.replaceState`, then sends `{token}` to `/sessions/exchange`. It does not automatically retry this single-use exchange. Concurrent React renders share one in-flight exchange. The returned session must match the route's dispute ID and have a future expiry.

The access token is kept in per-tab sessionStorage with a memory fallback when storage is unavailable. Sessions are never stored in localStorage, put in URLs, or included in query keys. SessionStorage is accessible to same-origin JavaScript; avoid adding untrusted scripts. Dispute requests use Bearer authorization. Local expiry and backend auth errors clear the session and cached dispute data. Reloading the clean URL restores a valid session from the same tab.

Use the latest alert when a link is invalid, consumed or expired. If an exchange response is lost after the server consumes the link, a fresh link may be needed. Missing sessions, wrong-dispute sessions, network timeouts, 404s and backend failures have explicit recovery screens.

## Screens and actions

- Secure entry and exchange loading state.
- Dispute detail: amount at risk, reason, status, response deadline in the viewer's local time, verified or unverified payment context, required/helpful proof and existing evidence.
- Add proof routes to `/d/:disputeId/proof`, explicitly stating that uploads are the next build step. It does not start a submission timer or upload files.
- Accept dispute opens an accessible confirmation dialog explaining the irreversible deduction. Only confirmation sends POST `/accept` with an Idempotency-Key. Failed retries reuse that key. Success refreshes dispute state.
- Closed, submitted, won, lost and expired-deadline disputes do not expose response actions.

## Structure

`src/api/` owns the central request client, API contracts and dispute endpoint functions. `src/auth/` owns link exchange and dispute-bound session handling. `src/App.tsx` owns route entry and first-slice screens; split these into feature modules as upload/evidence functionality grows. `src/styles.css` owns the mobile design. `src/test/` contains flow tests with deterministic API fixtures; no fixture data is bundled as a merchant-facing demo.

## Verification

Production TypeScript/Vite build and 11 flow tests pass. Tests cover URL cleanup, concurrent exchange deduplication, dispute binding, exchange-to-detail authorization, missing/expired sessions, invalid links, unverified payment fallback, action gating, the proof route, confirmation/idempotent accept retries and network recovery. Dependency audit was clean after upgrading Vitest.

Live backend health, OpenAPI route contracts and localhost CORS have been checked. A successful authenticated live detail check needs a fresh single-use alert link. Acceptance is tested using fixtures, not by deducting a live dispute amount.

## Next milestones

1. Verify a fresh alert end to end against the deployed backend.
2. Add file selection, `/timer/start`, presigned R2 uploads and `/complete`.
3. Add evidence polling, review cards, mismatch correction and retry handling.
4. Add coverage, editable draft summary, approval and idempotent submission.
5. Add PWA support, merchant analytics, broader accessibility/mobile checks and deployment. `vercel.json` already supplies SPA rewrites and basic response headers; allow the deployed frontend origin in backend CORS before testing it.

The referenced chat provided the screen plan and the API attachment. Its generated frontend build guide download was not retrievable; implementation follows the explicit first-slice request, attached API reference, live OpenAPI schema and inspected backend response code.
