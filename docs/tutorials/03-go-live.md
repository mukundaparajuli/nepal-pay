# Tutorial 3 — Going live

**Goal:** take the integration you built in
[Tutorial 2](./02-express-checkout.md) from the mock gateway to a real gateway,
prove it in sandbox, and ship it safely to production.

**Time:** an afternoon, most of it waiting on your gateway's onboarding.

**What you need:** sandbox (and eventually production) credentials from the
gateway you chose, and a **publicly reachable URL** for the callback.

---

## The two phases

Every gateway is the same story in two acts:

1. **Sandbox** — the gateway gives you test credentials and a UAT endpoint. No
   real money moves. You prove the whole flow here.
2. **Production** — the gateway gives you live credentials. Real money moves.
   You change one config value.

Do not skip phase 1. Sandbox exists precisely so production is boring.

---

## Step 1 — Pick a gateway and get credentials

| Gateway        | Flow                          | What you get from them                             |
| -------------- | ----------------------------- | -------------------------------------------------- |
| **eSewa**      | form POST                     | product code + HMAC secret                         |
| **Khalti**     | redirect + server lookup      | secret key                                         |
| **connectIPS** | form POST + server validation | merchant id, app id/name, password, `CREDITOR.pfx` |
| **Fonepay**    | GET redirect + HMAC-SHA512 DV | merchant PID + shared secret                       |

Each gateway has an onboarding process (a merchant account, KYC, a signed
agreement). Read the per-gateway integration guide for the specifics:

- [eSewa →](../esewa.md) · [Khalti →](../khalti.md) ·
  [connectIPS →](../connectips.md) · [Fonepay →](../fonepay.md)

You also need to **register your callback / return URLs** with the gateway.
They must be your real, public HTTPS URLs — you cannot use `localhost`.

---

## Step 2 — Store the secrets, once

The SDK never reads environment variables; your app does. Generate a template
listing every variable the tooling understands:

```bash
npx @nepal-payments/cli init
# or, run from this repo: pnpm --filter @nepal-payments/cli exec npay init
# ...and for a single gateway:
npx @nepal-payments/cli init --gateways esewa
```

This writes a `.env.example` with **placeholders only** — it never invents or
stores secrets. Copy it to `.env`, fill in the sandbox values, and make sure
`.env` is git-ignored:

```bash
cp .env.example .env
echo '.env' >> .gitignore
```

Here are the variables per gateway:

```bash
# eSewa
ESEWA_MERCHANT_CODE=
ESEWA_SECRET=
ESEWA_ENVIRONMENT=sandbox

# Khalti
KHALTI_SECRET_KEY=
KHALTI_RETURN_URL=https://your-app.example/payments/callback
KHALTI_ENVIRONMENT=sandbox

# connectIPS
CONNECTIPS_MERCHANT_ID=
CONNECTIPS_APP_ID=
CONNECTIPS_APP_NAME=
CONNECTIPS_PASSWORD=
CONNECTIPS_PRIVATE_KEY_PATH=./creditor.key.pem
CONNECTIPS_ENVIRONMENT=sandbox

# Fonepay
FONEPAY_PID=
FONEPAY_SECRET_KEY=
FONEPAY_RETURN_URL=https://your-app.example/payments/fonepay/return
FONEPAY_ENVIRONMENT=sandbox
```

> **Never commit `.env`.** These are live credentials. The repo's
> `.gitignore` and a secret scanner in CI help, but the first line of defence is
> keeping them out of git.

### connectIPS: convert your key first

connectIPS hands you a PKCS#12 archive (`CREDITOR.pfx`). WebCrypto cannot read
it, so convert it once to PKCS#8:

```bash
npx @nepal-payments/cli connectips import-pfx ./CREDITOR.pfx --out ./creditor.key.pem
# the password is read from NPAY_PFX_PASSWORD (or --password-stdin), never argv
```

Point `CONNECTIPS_PRIVATE_KEY_PATH` at the resulting PEM.

---

## Step 3 — Smoke-test your config offline

Before touching the network, confirm your configuration is coherent. The CLI
builds a real adapter from your environment without making a request:

```bash
npx @nepal-payments/cli gateway test mock      # full offline lifecycle
npx @nepal-payments/cli gateway test esewa     # builds the adapter from env vars
```

`gateway test` catches the boring failures — a missing variable, a malformed
private key, a bad base URL — in one second instead of one redirect later.

---

## Step 4 — Prove the flow in sandbox

Flip `environment: 'sandbox'` in your gateway config and run the exact routes
from Tutorial 2:

```ts
const gateway = createEsewa({
  merchantCode: process.env.ESEWA_MERCHANT_CODE!,
  secret: process.env.ESEWA_SECRET!,
  environment: 'sandbox',
  successUrl: 'https://your-app.example/payments/callback',
  failureUrl: 'https://your-app.example/payments/callback',
})
```

Because the callback must reach your machine, expose your local server with a
tunnel (for example `ngrok http 3000`) and register that public URL with the
gateway for the sandbox.

Now walk the flow in a browser:

1. Create an order and redirect the customer to the gateway.
2. Pay with the gateway's **sandbox test credentials**.
3. Watch your callback route log the verified, fulfilled order.

Test the unhappy paths too — they are the actual security surface:

- Pay, then re-send the callback by hand → must fulfill **once**.
- Change the amount in the callback → `AMOUNT_MISMATCH`.
- Change the order id → `ORDER_MISMATCH`.
- Tamper the signature → `SIGNATURE_MISMATCH`.
- Never pay → your reconciliation job must eventually report `pending`/`failed`.

---

## Step 5 — The production checklist

Go through this list before switching `environment` to `'production'`.

### Correctness and money

- [ ] Amounts come from user input only via `moneyFromDecimal(...)` — **no
      `parseFloat`, no `Number(amount) * 100`**.
- [ ] You verify the amount the gateway reports against the amount **you** saved.
- [ ] Fulfillment is guarded so the same order can never be fulfilled twice.

### Security

- [ ] The gateway secret lives only in server-side env vars, never in client code
      or logs.
- [ ] Your callback route treats everything as untrusted and calls `verify()`.
- [ ] You never trust a "success" flag from the browser or the query string.
- [ ] HTTPS everywhere; your callback URL is registered with the gateway.
- [ ] The gateway's server-to-server check is enabled where offered (Khalti's
      lookup, eSewa's status API, connectIPS `validatetxn`, Fonepay's
      `serverVerification`).

### Reliability

- [ ] Lost callbacks are recovered with [`reconcile()`](../reconciliation.md),
      driven from your own cron/queue.
- [ ] Payments are persisted via a real [`PaymentStore`](../persistence.md), so a
      redeploy does not lose in-flight orders.
- [ ] Callback handling is idempotent (retries and duplicate callbacks are safe).

### Operations

- [ ] Errors are logged with the `NepalPaymentsError.code`, never the raw secret
      or full payload.
- [ ] You can see, per order, which `txnRef` it maps to.
- [ ] You have a rollback: keep the mock (or a feature flag) to disable a gateway
      without a deploy.

---

## Step 6 — Handle the callback that never comes

Callbacks get lost — network blips, deploys, a customer closing the tab. Do not
sit and wait. Pair a persistent store with a reconciliation job:

```ts
import {
  reconcile,
  createInMemoryPaymentStore,
  paymentFromVerified,
} from '@nepal-payments/core'

const store = createInMemoryPaymentStore() // use your real store in production

// Run this from a cron/queue for orders that are still pending and old enough.
async function reconcilePending(
  gateway: GatewayAdapter,
  order: Order,
  txnRef: TxnRef
) {
  const result = await reconcile(
    gateway,
    { order, txnRef },
    {
      maxAttempts: 5,
      backoffMs: 250,
      timeoutMs: 10_000,
    }
  )

  if (result.resolved) {
    // completed / failed / canceled / expired — stop tracking it.
    await store.savePayment(paymentFromVerified(result.payment))
  }
}
```

`reconcile()` performs **one** bounded run and does not schedule itself. See
[reconciliation.md](../reconciliation.md) and [persistence.md](../persistence.md).

---

## Step 7 — Per-gateway gotchas

| Gateway        | Watch out for                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **eSewa**      | Order id becomes `transaction_uuid`; surcharges are **subtracted** from the amount. Callback is base64 JSON in `?data=`.                                     |
| **Khalti**     | Minimum **Rs. 10**, at most 2 decimals. The redirect alone is never trusted — every payment needs a server lookup.                                           |
| **connectIPS** | Convert `CREDITOR.pfx` to PKCS#8 first. The callback carries only `TXNID`; authenticity always comes from `validatetxn`. Amounts are integer paisa.          |
| **Fonepay**    | The callback's `DV` is a signed HMAC-SHA512 checked in constant time. `status()` **requires** the expected amount. `R1`/`R2` remarks may not contain commas. |

Each guide's [status mapping](../esewa.md) table tells you how the gateway's raw
statuses map onto the unified `PaymentStatus`.

---

## Step 8 — Go live

1. Swap sandbox credentials for production ones and set
   `environment: 'production'`.
2. Update the registered callback URL to your production domain if it differs.
3. Run `npx @nepal-payments/cli gateway test <gateway>` once more.
4. Do one small real payment yourself, end to end, and confirm it fulfills.
5. Watch the first few real payments, then relax.

## What's next

- [Security](../security.md) — the trust model and the adversarial review.
- [Errors](../errors.md) and [Troubleshooting](../troubleshooting.md) — when
  something misbehaves in production.
- [Project overview](../../README.md) — how the packages fit together.
