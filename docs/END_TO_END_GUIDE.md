# Proof Bridge: end-to-end guide

How to run Proof Bridge from start to finish:
1. make a real Razorpay test payment
2. raise a mock dispute against it
3. add proof from the phone
4. review what the AI found
5. submit the response
6. play the bank

The guide also covers which file formats are accepted, and the rules and guardrails around the AI.

| Service | Repo | Hosted |
| --- | --- | --- |
| Frontend (app) | [razorpay-frontend](https://github.com/insomniacsuperhero/razorpay-frontend) | https://razorpay-frontend-ashy.vercel.app |
| API | [razorpay-api-py](https://github.com/insomniacsuperhero/razorpay-api-py) | https://proof-bridge-api.onrender.com ([docs](https://proof-bridge-api.onrender.com/docs)) |
| Mock Disputes API | [razorpay-mock-disputes](https://github.com/insomniacsuperhero/razorpay-mock-disputes) | https://razorpay-mock-disputes.vercel.app |

Everything runs on Razorpay **test mode**. No real money moves.

---

## 1. What you need

- A Razorpay account in **Test mode**, with its test key ID and secret (`rzp_test_…`).
- The API's **`DEMO_ADMIN_SECRET`**, from Render → the API service → Environment. It goes in the `X-Demo-Secret` header of every demo call below.
- A phone, or a desktop browser with a narrow window, for the app.
- 2–3 proof files for the dispute reason you pick (see section 5). Use synthetic or anonymised files: the AI runs on Gemini's free tier.

In the commands below, set these once:

```sh
API=https://proof-bridge-api.onrender.com/api/v1
SECRET='<DEMO_ADMIN_SECRET>'
MOCK=https://razorpay-mock-disputes.vercel.app
```

Never paste live keys anywhere. Rotate any key that ends up in a chat or shared document.

## 2. Start the services

**Hosted (recommended for demos):** all three services are already running.

1. Wake the API, which sleeps after 15 minutes idle: open https://proof-bridge-api.onrender.com/health and wait for `{"ok": true, …}`. This can take up to 30 seconds.
2. Check the mock: https://razorpay-mock-disputes.vercel.app should return `{"ok":true}`.
3. Open the app: https://razorpay-frontend-ashy.vercel.app.

**Locally:** run each service from its repo's README:

| Order | Service | Command | URL |
| --- | --- | --- | --- |
| 1 | Mock | `RZP_KEY=… RZP_SECRET=… node server.mjs` | http://localhost:4010 |
| 2 | API | `uvicorn app.main:app --reload --port 8000` (with `MOCK_DISPUTES_BASE_URL=http://localhost:4010` in `.env`) | http://localhost:8000/docs |
| 3 | Frontend | `npm run dev` (with `VITE_API_BASE_URL=http://localhost:8000/api/v1` in `.env.local`) | http://localhost:5173 |

When everything runs locally, set `API=http://localhost:8000/api/v1`. The local API's `SECRET` is `dev-admin-secret` unless you changed it.

> No time for any of this? `https://razorpay-frontend-ashy.vercel.app/preview/home` (when preview is enabled) or `http://localhost:5173/preview/home` runs the whole app on sample data, with no backend.

## 3. Make a test payment

A dispute must sit on a **captured** payment.

1. Open the [Razorpay dashboard](https://dashboard.razorpay.com) and switch to **Test mode**.
2. Go to **Payment Links → Create Payment Link**. Enter an amount (for example ₹2,499) and a customer phone and email (test values are fine). Create it.
3. Open the link, choose **UPI**, enter **`success@razorpay`**, and pay.
4. Go to **Transactions → Payments** and copy the payment ID (`pay_…`). Its status should be **Captured**.

If the Razorpay webhook is set up on the API (`payment_link.paid`, `payment.captured`), the API remembers the latest captured payment. You can then leave `payment_id` out in the next step.

## 4. Raise a mock dispute

Razorpay test mode can't create disputes, so you create one on the mock. Pick a reason:

| `reason_code` | What the seller sees | Proof that is **needed** | Proof that **helps** |
| --- | --- | --- | --- |
| `goods_not_received` | Customer says the order never arrived | Delivery confirmation (`shipping_proof`) | Customer communication, invoice |
| `not_as_described` | Customer says the item was damaged or different | Product or packing photos (`proof_of_service`) | Customer communication, refund policy, delivery proof |
| `unauthorized` | Customer says they didn't make this payment | Customer communication | Account activity, delivery proof, invoice |
| `duplicate` | Customer says they were charged twice | Invoice (`billing_proof`) | Other proof |
| `refund_not_processed` | Customer says a promised refund didn't arrive | Refund confirmation | Cancellation record, customer communication |

### Option A: through the API (recommended)

This creates the dispute on the mock, sends the seller's alerts, and returns a ready-to-open alert link.

```sh
curl -s -X POST "$API/demo/seed" -H "X-Demo-Secret: $SECRET" -H 'Content-Type: application/json' \
  -d '{"payment_id":"pay_XXXXXXXX","reason_code":"goods_not_received","respond_in_hours":72}'
```

The response contains `dispute.id` (for example `disp_…`) and `link`.

### Option B: straight on the mock

This tests the webhook path. The mock sends a signed `payment.dispute.created` webhook to the API, and the API sends the alerts. The mock's `WEBHOOK_URL` and `WEBHOOK_SECRET` must be set.

```sh
curl -s -X POST "$MOCK/v1/disputes" -u 'rzp_test_xxx:YOUR_TEST_SECRET' -H 'Content-Type: application/json' \
  -d '{"payment_id":"pay_XXXXXXXX","reason_code":"goods_not_received","respond_in_hours":72}'
```

Or use the CLI from the mock's repo: `MOCK_URL=$MOCK RZP_KEY=… RZP_SECRET=… node create_dispute.mjs pay_XXXXXXXX goods_not_received 72`.

### What happens next

- **In-app:** an alert banner, and the dispute appears under **Disputes → Needs response**.
- **Web Push:** if the app is installed on the phone with notifications on.
- **Email and WhatsApp:** if those channels are configured on the API. Otherwise they are recorded as skipped, which you can see on the Notifications screen.
- **Razorpay dashboard:** the payment's notes show `mock_dispute_status: open`.

`respond_in_hours` sets the deadline. Use `4` to see the urgent state, or resend alerts any time with `curl -s -X POST "$API/demo/disputes/<id>/nudge" -H "X-Demo-Secret: $SECRET"`.

## 5. Add proof

1. Open the alert link (Option A's `link`, the push notification, or the email or WhatsApp message), or open the app and tap the dispute under **Disputes**.
2. Tap **Add proof from phone**. The on-screen timer starts here.
3. Choose **Take a photo**, **Choose from gallery** or **Choose a file**. You can pick several at once. The app reads **only the files you pick**.

### Formats accepted

| Format | Accepted | What happens to it |
| --- | --- | --- |
| **JPG / JPEG, PNG** | Yes | Photos over about 350 KB are shrunk on the phone to about 1600 px JPEG, which also removes location data. The API re-encodes them: 1600 px for the AI, 2400 px for Razorpay |
| **PDF** | Yes | Text is read locally; for long PDFs, the 4 most relevant pages are shown to the AI. PDFs over 8 MB send only those pages to Razorpay |
| **Word (.docx)** | Yes | Text is read, and the file is converted to PDF for Razorpay. Oversized or suspicious archives are refused |
| **WebP** | Partly | Large WebP photos are converted to JPG on the phone. Small WebP screenshots are refused; share them as JPG or PNG |
| **HEIC / HEIF** (iPhone) | No | Refused with a message: set iPhone Settings → Camera → Formats → **Most Compatible**, or take a screenshot |
| Anything else | No | "Choose a JPG, PNG, PDF or Word (.docx) file" |

Other limits:
- Files can be up to **100 MB**, but must not be empty.
- Filenames can be up to 200 characters.
- The type is checked from the file's contents, not its name.

**Good proof for a demo** (`goods_not_received`):
- a courier tracking screenshot showing "Delivered", a date and a tracking ID
- a WhatsApp chat where the customer says "received, thanks"
- an invoice for the same amount

Add one irrelevant photo too, to show the **Not useful** label.

## 6. Watch it check (and what the AI may and may not do)

On **Checking your proof**, each file moves through four steps: **Upload → Read → Check → Save**. Most files take 10–20 seconds. You can tap **Review N ready now** while the rest finish, or add more files.

| Step | What happens | Who decides |
| --- | --- | --- |
| Upload | The phone uploads straight to private Cloudflare R2 storage through a presigned URL | — |
| Read | Gemini reads the file and returns its type, the evidence field it fits, whether it's readable, and the facts visible in it | **AI** |
| Check | The facts are matched against the real Razorpay payment, and the evidence rules decide the label | **Fixed rules (code)** |
| Save | Only **Strong** and **Relevant** files are uploaded to Razorpay Documents (a real `doc_` ID). Nothing goes to the bank yet | **Rules** |

### AI guardrails and rules

**What the AI does:** it reads one file at a time and reports what is visibly there. That is all.

**What the AI never does:**
- decide which proof a dispute needs (a fixed rules table does)
- decide a file's label (the rules do)
- write the summary
- submit anything

**How the AI is constrained:**
- **Instructions:** "Extract only facts that are visibly present. Never guess or invent values; use null when not visible."
- **Structured output:** temperature 0, JSON only, validated against a strict schema before anything is shown. A malformed answer is rejected, not displayed.
- **Facts it may return:** only this list: tracking ID, courier, delivery status and date, amount, order ID, invoice number, customer name, last 4 digits of a phone number, a customer quote (up to 200 characters) with its date, and refund reference and date.
- **Saying it's unsure:** the AI can mark a file *unreadable* (blurred or cropped), and can mark its field choice as *low confidence*.
- **Time limits:** 30 seconds per call. The main model gets up to 35 seconds; the optional fallback model takes over on overload (429/5xx) or a retired model (404). One file has 75 seconds in total. A card stuck for 150 seconds is marked interrupted, so it never blocks submitting.
- **Privacy:** only the files the seller picks are read. Originals stay unchanged, with the facts stored beside them. The AI key never leaves the server.
- **Demo fallback:** a deterministic keyword extractor (`AI_PROVIDER=fake`) for development and tests. It is clearly labelled, never presented as Gemini.

**How a file gets its label** (checked in code, in this order):

| Label | Rule |
| --- | --- |
| **Needs attention** | The file is unreadable (e.g. the date is cut off), **or** a fact contradicts the payment |
| **Not useful for this dispute** | Readable, but it fills no field this dispute reason needs or is helped by |
| **Strong** | Fills a **needed** field and shows that field's key fact: delivery status, date or tracking ID for delivery proof; the customer's own words for communication; invoice number, amount or order ID for an invoice; refund reference or date for a refund; a clear photo for product proof |
| **Relevant** | Fills a helpful field, or a needed field without its key fact |

**What "matches the payment" means:**
- **Amount:** equals the payment amount or the disputed amount.
- **Delivery or refund date:** not before the payment date (one day's grace). Up to 60 days after counts as a match.
- **Phone:** the last 4 digits equal the customer's phone on the payment.
- **Order ID:** equals the payment's order reference.
- A mismatch shows both values, for example "Shows ₹1,999, but the payment was ₹2,499".

**If the AI is unsure** which field a file fits, the card asks one yes/no question, for example "Is this the delivery confirmation for order PB-1001?".

## 7. Review, fix and submit

1. **Review evidence:**
   - One card per evidence type, each with its label, the Razorpay field it fills (e.g. `fills shipping_proof`), and its facts.
   - Each fact names its source file and is marked "Matches payment" where it does.
   - You can **correct a fact** (pencil icon), confirm "It belongs to this order", **replace** or **remove** a file, or retry one that failed.
2. **Continue to summary:**
   - **Coverage** shows one of three states:
     - **Good coverage:** every needed item is present and Strong.
     - **Enough to submit:** every needed item is present.
     - **Missing required proof.**
   - **Summary for the bank** is drafted **only from the facts on your cards**, by code, not by a second AI call. It is up to 1,000 characters (Razorpay's limit) and editable; edits save on blur.
3. **Submit response** opens a confirmation listing the files, the fields, the amount and the summary.
   - **Confirm and submit** sends it, protected by an idempotency key so a double tap never sends twice.
   - **Save as draft** stores it on the dispute without sending.
4. **Submitted:** the dispute is **Under review**, with the time taken shown.
   - **What you sent** shows the summary.
   - **Proofs** (tap to expand) groups files into **Sent to the bank** and **Not sent**, each with its label and thumbnail.
   - The Razorpay dashboard shows `mock_dispute_status: under_review` on the payment.

The other path is **Accept dispute**, which refunds the customer: the amount is deducted and the dispute is marked lost.

## 8. Play the bank

```sh
D=disp_XXXXXXXX

# The bank asks for clearer proof: the dispute reopens, the matching card is flagged, and a new deadline is set
curl -s -X POST "$API/demo/disputes/$D/action-required" -H "X-Demo-Secret: $SECRET" -H 'Content-Type: application/json' \
  -d '{"field":"shipping_proof","reason":"The delivery date is not visible.","respond_in_hours":48}'

# The bank decides
curl -s -X POST "$API/demo/disputes/$D/resolve" -H "X-Demo-Secret: $SECRET" -H 'Content-Type: application/json' \
  -d '{"outcome":"won"}'          # or "lost"

# Every event recorded for this dispute (timer, submit time, alerts)
curl -s "$API/demo/metrics/$D" -H "X-Demo-Secret: $SECRET"
```

After **action-required**, the app shows "The bank asked for more proof". Add a clearer file, check, and submit again.

## 9. Reset and troubleshooting

**Start clean:**
- **Mock:** `curl -s -X POST "$MOCK/mock/reset" -u 'rzp_test_xxx:YOUR_TEST_SECRET'` removes every mock dispute.
- **One dispute's local state:** `curl -s -X POST "$API/demo/reset/$D" -H "X-Demo-Secret: $SECRET"`.
- **Everything in the app's database:** in Supabase, empty `dispute_runs`, `evidence_items`, `upload_sessions`, `merchant_edits`, `link_tokens`, `idempotency_keys`, `webhook_events`, `metric_events` and `notifications`. Keep `alembic_version`.
- **On the phone:** use a private window, or clear the site's data.

| Problem | Fix |
| --- | --- |
| App shows "Opening your account" for a long time | The API is waking up (Render free tier). Wait about 30 seconds, or open `/health` first |
| "This alert link is no longer valid" | Links are single use and expire. Get a new one: `curl -s -X POST "$API/demo/deep-link/$D" -H "X-Demo-Secret: $SECRET"` |
| 401 "Admin secret required" | Wrong or missing `X-Demo-Secret` |
| Mock returns 401 | Basic auth must be your `rzp_test_` key and secret, the same pair the mock has |
| "Could not fetch the payment from Razorpay" | The `pay_` ID is wrong or not captured, or the mock has no `RZP_KEY`. Pass `"amount"` in paise as a workaround |
| Dispute created on the mock but no alert | The mock's `WEBHOOK_URL` or `WEBHOOK_SECRET` is missing or doesn't match the API's `MOCK_DISPUTES_WEBHOOK_SECRET`. Use Option A instead |
| Upload fails straight away | The R2 bucket's CORS rule must allow the app's origin with `PUT` and `Content-Type` |
| A card stays at Read for a long time | Gemini is slow or overloaded. The fallback model takes over; after 150 seconds the card is marked interrupted and can be retried |
| CORS error in the browser console | Add the app's origin to the API's `FRONTEND_ORIGIN` or `EXTRA_CORS_ORIGINS` on Render |
| Email or WhatsApp says "skipped" | That channel's keys aren't set on the API. In-app alerts always work |
