# Proof Bridge: frontend (razorpay-frontend)

Answer a payment dispute from your phone in under 2 minutes. The seller opens the dispute alert, adds proof from the camera, gallery or a PDF, checks what the app understood, and submits the response. Built for the Razorpay x ISB Build Challenge (Track 1, "Razorpay in Your Pocket"). This is a prototype on Razorpay **test mode**, not an official Razorpay app.

**Live app:** https://razorpay-frontend-ashy.vercel.app

**Step-by-step demo guide** (payment → mock dispute → proof → submit): [docs/END_TO_END_GUIDE.md](docs/END_TO_END_GUIDE.md)

## The three services and how they connect

| Service | What it does | Code | Hosted at |
| --- | --- | --- | --- |
| **Frontend** (this repo) | Mobile web app (PWA) on Razorpay's Blade design system | [razorpay-frontend](https://github.com/insomniacsuperhero/razorpay-frontend) | https://razorpay-frontend-ashy.vercel.app (Vercel) |
| **API** | FastAPI. Holds every secret, reads proof with Gemini, checks it against the real payment, uploads to Razorpay Documents, sends alerts, submits the response | [razorpay-api-py](https://github.com/insomniacsuperhero/razorpay-api-py) | https://proof-bridge-api.onrender.com ([docs](https://proof-bridge-api.onrender.com/docs), [health](https://proof-bridge-api.onrender.com/health)) (Render) |
| **Mock Disputes API** | Same routes and responses as Razorpay's Disputes API, because test mode can't create disputes | [razorpay-mock-disputes](https://github.com/insomniacsuperhero/razorpay-mock-disputes) | https://razorpay-mock-disputes.vercel.app (Vercel + Upstash Redis) |

```
Phone (this app) ──HTTPS + Bearer──► Proof Bridge API ──► Razorpay test API (real: payments, Documents, notes)
   no secrets                          all secrets   ├──► Mock Disputes API ──signed webhooks──► API
        ▲                                             ├──► Gemini · Cloudflare R2 · Supabase Postgres
        └── alert link /d/<id>?t=<token> ◄─────────── └──► Alerts: in-app, Web Push, email, WhatsApp
```

How this app connects:
- **To the API:** every call goes to `VITE_API_BASE_URL` (default `https://proof-bridge-api.onrender.com/api/v1`) with a Bearer session token. The API must list this app's origin in `FRONTEND_ORIGIN` or `EXTRA_CORS_ORIGINS`.
- **To storage:** file bytes go straight from the phone to Cloudflare R2 through a presigned URL from the API. The API token is never sent to R2.
- **To the mock and Razorpay:** never directly. The API talks to both. Going live only changes the API's dispute provider, not this app.

> **Render sleeps.** The API is on Render's free tier and sleeps after 15 minutes idle. Open the [health link](https://proof-bridge-api.onrender.com/health) a minute before a demo; the first request can take up to 30 seconds.

## Tech stack

| Area | Technology | Used for |
| --- | --- | --- |
| UI | React 19, TypeScript 5.9 | Components and type-safe API contracts (`src/api/types.ts`) |
| Build | Vite 6 | Dev server, production build, `import.meta.env` config |
| Design system | Razorpay Blade 12 (with styled-components 5, framer-motion), Blade fonts | Every button, badge, bottom sheet, progress bar, skeleton and alert |
| Routing | React Router 7 | Tabs at the top level, each dispute's flow under `/d/:id` |
| Data | TanStack Query 5 | Fetching, caching, polling while files are read (2.5 s), refetch on focus |
| PWA | Web App Manifest, service worker (`public/sw.js`), Web Push API | Install to home screen, phone notifications |
| Analytics | Vercel Web Analytics (`@vercel/analytics`) | Page views; the sign-in token is stripped from URLs first |
| Tests | Vitest 5, Testing Library, jsdom | 7 flow tests over deterministic fixtures |
| Hosting | Vercel (static) | `vercel.json`: SPA rewrites and security headers |

## Spin it up

Requires Node.js 22.12 or later.

```sh
git clone https://github.com/insomniacsuperhero/razorpay-frontend.git && cd razorpay-frontend
npm install
npm run dev        # http://localhost:5173
npm test           # 7 flow tests
npm run build
```

Open **http://localhost:5173** (not 127.0.0.1): the API's CORS allows `localhost:5173` by default.

- **Against the hosted API** (default): nothing else to run. Make sure the API's `FRONTEND_ORIGIN` or `EXTRA_CORS_ORIGINS` includes `http://localhost:5173`.
- **Against a local API:** start the API on port 8000 (see its README), then set `VITE_API_BASE_URL=http://localhost:8000/api/v1` in `.env.local`.
- **With no backend at all:** open `http://localhost:5173/preview/home`. The whole app runs on sample data, including uploading and submitting a dispute.

### Environment variables

Copy `.env.example` to `.env.local`. Only public values belong here: **never** put Razorpay keys, the demo admin secret or signing keys in a `VITE_` variable.

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_API_BASE_URL` | API base URL, must end in `/api/v1` | `https://proof-bridge-api.onrender.com/api/v1` |
| `VITE_MERCHANT_NAME` | Business name shown on Home and Account | `Your business` |
| `VITE_ENABLE_PREVIEW` | `true` turns on `/preview/*`, the app on sample data (always on in `npm run dev`) | off in production |

## How the app works

- **Signing in:** an alert link (`/d/<dispute_id>?t=<token>`) carries a single-use token. The app removes it from the URL before rendering and swaps it for a short-lived session in per-tab `sessionStorage`. When the API runs with `DEMO_OPEN_ACCESS`, the app opens straight to Home.
- **Tabs:** Home, Payments (and settlements), Disputes, Products, Support and Account, filled from the Razorpay test account through the API.
- **The dispute flow** (`/d/:id`):
  1. **Dispute:** plain-language reason, deadline, verified payment. Add proof, or accept the dispute.
  2. **Add proof:** camera, gallery or a file. Large photos are shrunk to about 1600 px JPEG on the phone first, which also drops location data.
  3. **Checking:** each file shows Upload → Read → Check → Save and what was found so far. You can review ready files while others finish.
  4. **Review:** one card per evidence type, labelled Strong, Relevant, Needs attention or Not useful. Every fact shows its source and can be corrected.
  5. **Summary:** coverage checklist and an editable summary. Submit, or save as a draft.
  6. **Submitted:** the response sent, the time taken, and the proofs grouped as sent and not sent.
- **Alerts:** an in-app banner and Web Push (install the app to the home screen for phone notifications), plus email and WhatsApp from the API. Opening a dispute clears its alerts.
- **Accessibility:** the dispute flow is built to WCAG 2.2 AA. Each screen sets the page title and moves focus to its heading, live regions announce progress and errors, touch targets are 44 px, and animations respect reduced motion. Automated axe checks are clean on every flow screen.

## Raise a mock dispute (short version)

The [end-to-end guide](docs/END_TO_END_GUIDE.md) has every step. In short:

1. In the Razorpay test dashboard, create a Payment Link and pay it with UPI `success@razorpay`. Copy the `pay_…` ID.
2. Raise the dispute through the API, which also sends the alerts and returns an alert link:

```sh
curl -s -X POST https://proof-bridge-api.onrender.com/api/v1/demo/seed \
  -H 'X-Demo-Secret: <DEMO_ADMIN_SECRET from Render>' -H 'Content-Type: application/json' \
  -d '{"payment_id":"pay_XXXXXXXX","reason_code":"goods_not_received","respond_in_hours":72}'
```

3. Open the returned `link` (or the app's Disputes tab) and respond.

## Code structure

```
src/
  main.tsx            entry: React Query, router, service worker, Vercel Analytics
  App.tsx             sign-in, routes, dispute workspace, loading states
  api/                request client, contracts, dispute-flow and merchant-tab endpoints, R2 upload with progress
  auth/               link exchange and session storage
  components/         app shell (tab bar), shared UI (Screen, Section, skeletons, screen-reader helpers)
  features/           one file per screen: DisputeScreen, AddProofSheet, CheckingScreen, ReviewScreen,
                      EvidenceFile, SummaryScreen, SentResponse, AppTabs, PushBanner, PhoneNotifications
  state/uploads.tsx   uploads kept in memory across screens, so going back never loses a file
  lib/                formatting, on-phone image resizing, Web Push subscription
  dev/Preview.tsx     the whole app on sample data at /preview
  test/               flow tests
public/               PWA manifest, icons, service worker (sw.js)
docs/                 END_TO_END_GUIDE.md
```

## Deploy (Vercel)

1. Import this repo in Vercel (framework preset: Vite).
2. Set `VITE_API_BASE_URL=https://proof-bridge-api.onrender.com/api/v1` and, optionally, `VITE_MERCHANT_NAME` and `VITE_ENABLE_PREVIEW`.
3. On Render, set the API's `FRONTEND_ORIGIN` to this Vercel URL (or add it to `EXTRA_CORS_ORIGINS`). Alert links use that origin too.
4. In the Vercel project, open **Analytics** and enable Web Analytics.
5. For phone notifications, the API needs `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Install the app to the home screen, then turn on notifications from the prompt on Home or from Account.

## Security notes

- The app holds no secrets. Razorpay keys, the AI key, webhook secrets and the demo admin secret live only on the API.
- Sessions live in per-tab `sessionStorage`, never in `localStorage` or URLs.
- The single-use link token is removed from the address bar before the app renders, and stripped again before analytics.
- Rotate any key that has been pasted into chat or a shared document.
