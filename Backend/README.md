# Backend

Express API plus RabbitMQ workers for Maji ya Umma. Works with a local RabbitMQ
or **Amazon MQ for RabbitMQ**; only `AMQP_URL` changes. Customers pay with
**M-Pesa** (Daraja STK Push) or **card** (Stripe).

## How it fits together

```
browser ── Firebase Auth (sign-in only) ──▶ ID token
   │
   └─ HTTPS + Bearer token ─▶ API (server.js) ─── reads ───────────────▶ Firestore (Admin SDK)
                                 │                                         ▲
meter gateways ─ X-Api-Key ─▶    │ publish                                 │ writes
Daraja / Stripe ─ callbacks ─▶   ▼                                         │
                         exchange "maji.events" ──▶ work queues ──▶ worker.js
                                                                   │
                                                                   ├─▶ M-Pesa Daraja (STK push / query)
                                                                   ├─▶ Stripe (PaymentIntents)
                                                                   ├─▶ Africa's Talking (SMS)
                                                                   └─▶ SMTP (email)
```

Rule of thumb: actions that must check current state and answer right away
stay synchronous (signup, admin approvals, reads). Slow work, high-volume
work, and anything that talks to an outside service goes through RabbitMQ.

### Flows

| Flow | Path |
|---|---|
| **M-Pesa payment** | `POST /api/me/payments` creates the payment (`queued`) → `payments.initiate` sends the STK push (`pending`) → Daraja calls `/api/mpesa/callback/<token>` → `payments.reconcile` settles it: allocates to the oldest unpaid bills, and anything left over becomes credit. If the callback never arrives, `payments.status_check` (fed by a delay queue) polls Daraja up to 5 times, then fails the payment. |
| **Card payment** | `POST /api/me/payments` with `method: "card"` creates a Stripe PaymentIntent (synchronously: the browser needs its client secret) → the customer enters their card in Stripe's iframe → the browser calls `/api/me/payments/:id/confirm`, and the server asks Stripe → `payments.stripe` settles it. Stripe's webhook (`/api/stripe/webhook`) and the status-check poller are backups. A decline leaves the payment open so another card can be tried. Unfinished payments are cancelled at Stripe after `STRIPE_MAX_STATUS_CHECKS`, and only then marked failed. |
| **Meter readings** | Gateways/staff `POST /api/readings` → `readings.process` turns cumulative readings into monthly usage (exact litres). Readings may arrive out of order; late ones are slotted between their neighbours, so the totals don't depend on arrival order. Rollbacks and leaks (> `HIGH_USAGE_LITRES_PER_DAY`) raise `meter.anomaly_detected`. |
| **Billing** | Hourly scheduler (in the worker) requests last month's run once it has ended (+`BILLING_GRACE_HOURS`); admins can also run it. `billing.runs` fans out one message per meter → `billing.generate` creates bill `<period>_<meter>` using `services/tariff.js` and applies any credit. Re-running is safe. |
| **Notifications** | `notifications.dispatch` gets a copy of every customer-facing event and turns it into `notification.sms` / `notification.email` messages. Separate consumers send them, so a failed email never re-sends an SMS, and each notification is sent once (recorded in `notifications/`). |
| **Connections** | Customer request → `connections.record`. An admin approval creates `meters/<meterNumber>` and links it to the customer in one transaction. |
| **Tickets, profile edits** | Queued and recorded by `tickets.record` / `profiles.update`. |

### Reliability

- An API `202` is only sent after the broker confirms it has stored the
  message (publisher confirms, persistent messages, durable queues).
- Failures retry every `MQ_RETRY_DELAY_MS` (via `<queue>.retry`) up to
  `MQ_MAX_ATTEMPTS`, then park in `<queue>.dlq`. Malformed or impossible
  messages (e.g. an unknown meter) go straight to the DLQ. The admin dashboard
  shows counts for every queue.
- Delivery is at-least-once, so every handler is idempotent: writes are keyed
  on the event id, follow-up events get ids derived from it, and transactions
  guard state changes (a payment can't be pushed or settled twice).

### Security model

**Payment confirmations are only hints.** Neither M-Pesa callbacks, Stripe
webhooks, the browser's "I paid", nor a message on the queue can mark a payment
paid or failed by themselves. The worker always asks the provider (Daraja STK
query, Stripe API) before settling, and credits the amount *we* asked to charge.
Someone who could post to the callback URL or write to RabbitMQ still can't
fake a payment. Covered by `npm run test:mpesa` and the card part of `npm run test:e2e`.

- The browser only talks to Firebase **Auth**. Firestore is closed to browsers
  (`firestore.rules`); the backend uses the Admin SDK with a service account.
- Every `/api/me/*` route acts on the user from the verified ID token, never
  on an email or id sent by the client.
- Admin routes check `userRole == "admin"` in Firestore on every request, so
  revoking a role takes effect immediately.
- Stripe webhooks are signature-checked (HMAC + timestamp). The M-Pesa
  callback URL carries a secret token (Daraja doesn't sign callbacks), and
  allowlisting Safaricom's IPs at your load balancer is recommended. Meter
  gateways use an API key. Signup and payment initiation are rate limited, and
  CORS only allows `CLIENT_ORIGIN`.
- Card numbers never reach this app: they go from Stripe's iframe straight to
  Stripe (PCI SAQ A).
- In production, give each service its own Amazon MQ user with least
  privilege (the API only publishes to `maji.events`; workers only consume),
  and use `amqps://`.

## Running locally

```bash
# repo root: RabbitMQ (management UI http://localhost:15672, guest/guest)
docker compose up -d rabbitmq

cd Backend
npm install
cp .env.example .env      # set FIREBASE_SERVICE_ACCOUNT_FILE + METER_INGEST_API_KEY
npm start                 # API on :5000
npm run worker            # all consumers + billing scheduler

cd ../newClient
cp .env.example .env      # Firebase web config + VITE_API_URL
npm install && npm run dev
```

Without M-Pesa/SMS/SMTP credentials everything still works: payments use the
simulator (phone numbers ending in `0000` simulate the customer cancelling)
and SMS/email are printed by the worker.

### First admin

```bash
npm run set-role -- you@example.com admin
```

After that, admins can grant or revoke roles on the Users page.

### Simulated meter data

Until real meters report in, after approving a connection request:

```bash
npm run simulate-readings -- --days 90                       # daily readings for every meter
npm run simulate-readings -- --days 60 --backdate-install    # demo only: makes past months billable
npm run simulate-readings -- --days 3 --leak MTR-12345678     # triggers a leak alert
```

### Meter gateway API

```http
POST /api/readings
X-Api-Key: <METER_INGEST_API_KEY>
Content-Type: application/json

{ "readings": [ { "meterNumber": "MTR-12345678", "reading": 1234.567, "readAt": "2026-11-15T06:00:00+03:00" } ] }
```

`reading` is the cumulative dial value in m³. Up to 500 per request. Re-sending
the same reading (same meter and timestamp) is harmless.

## Moving the live project over

1. **Service account:** Firebase console → Project settings → Service accounts →
   *Generate new private key*; set `FIREBASE_SERVICE_ACCOUNT_FILE`. Keep the
   file out of git (`.gitignore` already covers `*service-account*.json`).
2. **Deploy rules and indexes** (from the repo root), *after* the new backend
   is live, because the old code needs open rules:
   `npx firebase-tools deploy --only firestore --project maji-ya-umma`
3. **Purge stored card data.** The old payment form saved card numbers and
   CVVs in plain text:
   `npm run purge-card-data` (dry run), then `npm run purge-card-data -- --apply`.
4. **Existing users** need nothing: each profile moves to `user/<uid>` on that
   user's first sign-in and gets an account number. Old tickets and connection
   requests have no `uid`, so they appear for admins but not in customers' lists.
5. **Firebase API key**: the web key in git history is public by design, but
   consider restricting it to your domains in Google Cloud console → Credentials.

### M-Pesa (Daraja)

1. Create an app at developer.safaricom.co.ke and copy the consumer key/secret.
2. Set `MPESA_MODE=sandbox`, `MPESA_SHORTCODE=174379`, the sandbox passkey
   (in `.env.example`), a random `MPESA_CALLBACK_TOKEN`, and `PUBLIC_API_URL`.
   This must be **https** and reachable by Safaricom; for development use a
   tunnel such as `ngrok http 5000`.
3. For production: your own paybill/till shortcode and passkey, `MPESA_MODE=production`.

Callbacks that don't match any payment (rare: a push that was interrupted
mid-flight) are stored in `unmatchedMpesaCallbacks` and shown on the admin
Payments page for manual crediting.

### Card payments (Stripe)

1. Stripe Dashboard → Developers → API keys: set `STRIPE_SECRET_KEY` and
   `STRIPE_PUBLISHABLE_KEY` (test keys first). The frontend gets the
   publishable key from the API, so nothing changes in `newClient/.env`.
2. Webhooks → add endpoint `PUBLIC_API_URL/api/stripe/webhook` for
   `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `payment_intent.canceled`; set `STRIPE_WEBHOOK_SECRET` to its signing secret.
   Locally: `stripe listen --forward-to localhost:5000/api/stripe/webhook`.
3. Test cards: `4242 4242 4242 4242` (succeeds), `4000 0025 0000 3155`
   (3-D Secure), `4000 0000 0000 9995` (declined); any future expiry and CVC.

Charges are in KES. Stripe has a minimum charge per currency; smaller amounts
are rejected with Stripe's message. If you'd rather not expose a webhook
endpoint at all, Stripe can deliver events to Amazon EventBridge instead,
which would need a small bridge into RabbitMQ.

### Amazon MQ

1. Create an Amazon MQ → RabbitMQ broker (cluster deployment for production)
   and a broker user (`guest` doesn't exist there).
2. `AMQP_URL=amqps://<user>:<password>@<broker-endpoint>:5671` (URL-encode the
   password) and `MQ_QUEUE_TYPE=quorum`.
3. Allow the API/worker hosts to reach port 5671.

The API and worker declare all exchanges and queues on startup.

## Scaling

Run more worker processes, optionally limited to certain consumers:

```bash
WORKER_QUEUES=paymentsInitiate,paymentsReconcile,paymentsStatusCheck npm run worker:prod
WORKER_QUEUES=readings npm run worker:prod
```

Keys: `profiles, tickets, connections, paymentsInitiate, paymentsReconcile,
paymentsStatusCheck, readings, billingRuns, billingGenerate, notifications,
sms, email`. The billing scheduler runs in any worker that includes
`billingRuns`; running it in several is safe.

## Changing queue settings

`MQ_QUEUE_TYPE`, `MQ_RETRY_DELAY_MS` and the delay-queue TTLs are stored as
queue arguments. RabbitMQ refuses to redeclare an existing queue with different
arguments (`PRECONDITION_FAILED`). Drain and delete the affected queues
(management UI → Queues), then restart the API and worker.

## Testing

`npm run test:e2e` drives the real API, broker and workers through every flow
above in 23 checks (about a minute; the card checks use a local fake Stripe,
`test/fake-stripe.js`). `npm run test:mpesa` (4 checks) shows that forged or wrong
M-Pesa callbacks can't settle payments (against `test/fake-daraja.js`).
Both run only against the Firebase emulators, and `test:e2e` wipes them first:

```bash
# terminal 1 (repo root)
npx firebase-tools emulators:start --only auth,firestore --project demo-maji
# terminal 2 (repo root). Fresh broker: the shorter retry delay below is a
# queue argument and conflicts with queues declared with the default.
docker compose down -v && docker compose up -d rabbitmq
cd Backend
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
       FIREBASE_PROJECT_ID=demo-maji METER_INGEST_API_KEY=test-meter-key \
       MPESA_CALLBACK_TOKEN=test-callback-token MQ_RETRY_DELAY_MS=2000 \
       MPESA_SIMULATED_CALLBACK_DELAY_MS=2000 MPESA_STATUS_CHECK_DELAY_MS=8000 \
       PAYMENT_RATE_LIMIT_PER_10_MIN=100 \
       STRIPE_SECRET_KEY=sk_test_fake STRIPE_PUBLISHABLE_KEY=pk_test_fake \
       STRIPE_WEBHOOK_SECRET=whsec_test STRIPE_API_HOST=localhost STRIPE_API_PORT=12111 \
       STRIPE_API_PROTOCOL=http E2E_FAKE_STRIPE_PORT=12111
npm run start:prod & npm run worker:prod &
npm run test:e2e && npm run test:mpesa
```

To point the frontend at the emulators, add
`VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099` and
`VITE_FIREBASE_PROJECT_ID=demo-maji` to `newClient/.env`.
