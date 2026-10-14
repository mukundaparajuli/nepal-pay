# Tutorial 2 — A checkout page with Express

**Goal:** build a small but complete Express server that takes an order, sends
the customer to a gateway, and safely fulfills the order when the payment comes
back — including protection against duplicate callbacks.

**Time:** about 20 minutes.

**What you need:** from [Tutorial 1](./01-first-payment.md). You do **not** need
gateway credentials: we develop against the mock gateway, then switch to eSewa
sandbox at the end.

By the end you will have:

```text
GET  /                    → a tiny checkout page
POST /checkout            → create an order + return the gateway checkout
GET  /payments/callback   → the gateway sends the customer back here
POST /dev/simulate        → DEV ONLY: pretend the customer paid (mock)
```

---

## Step 1 — Scaffold the project

```bash
mkdir nepal-payments-store
cd nepal-payments-store
pnpm init
pnpm add @nepal-payments/core @nepal-payments/mock express
pnpm add -D tsx typescript @types/express
```

Add a `dev` script to `package.json` so you can run the server with one command:

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch server.ts"
  }
}
```

> **Why `"type": "module"`?** The SDK is ESM-only. Setting the type avoids
> `require`-vs-`import` surprises.

---

## Step 2 — Create the gateway

Create `server.ts` and start with the gateway and the in-memory state:

```ts
import express, { type Response } from 'express'
import {
  createOrder,
  moneyFromDecimal,
  NepalPaymentsError,
  PaymentError,
  type Order,
  type UnverifiedCallback,
} from '@nepal-payments/core'
import { createMockGateway } from '@nepal-payments/mock'

const gateway = createMockGateway({
  secretKey: process.env.MOCK_SECRET_KEY ?? 'dev-secret',
})

// A real app uses a database. Two Maps are enough to see the flow.
const orders = new Map<string, Order>()
const fulfilled = new Set<string>()
```

Three pieces of state matter:

- `orders` — the merchant-side source of truth (what you charged).
- `fulfilled` — the set of orders you have already fulfilled, for idempotency.

You also need to remember `txnRef.id → order.id`, but for the mock the callback
already carries the order id, so we look orders up directly. We cover the
per-gateway mapping in Step 8.

> **Never** keep the order only in the browser or in a signed cookie. You must
> compare the callback against an order **you** stored server-side.

---

## Step 3 — A shared callback handler

Everything that verifies a payment goes through **one** function. Both the real
callback route and the dev simulator call it:

```ts
async function processCallback(callback: UnverifiedCallback) {
  // 1. Which order is this about?
  const orderId = String(callback.data.order_id ?? '')
  const order = orders.get(orderId)
  if (order === undefined) {
    throw new PaymentError('Unknown order', 'UNKNOWN_TRANSACTION')
  }

  // 2. Verify against the order WE stored. This throws on any mismatch.
  const payment = await gateway.verify(callback, { expected: order })

  // 3. Fulfill exactly once, and only on a completed payment.
  if (payment.status === 'completed' && !fulfilled.has(payment.orderId)) {
    fulfilled.add(payment.orderId)
    console.log(`Order ${payment.orderId} paid — fulfilling`)
    // await db.markPaid(payment.orderId)
    // await sendReceipt(payment.orderId)
  }

  return payment
}
```

Notice what is **not** here: we never read `callback.data.status` to decide
anything. The only status we trust is `payment.status`, which `verify()` sealed
after checking the signature, order, and amount.

Also notice the idempotency guard: gateways can send the same callback more than
once, so fulfillment is gated by `fulfilled.has(...)`.

---

## Step 4 — The checkout route

```ts
app.post('/checkout', async (req, res) => {
  try {
    const order = createOrder({
      id: String(req.body.orderId),
      amount: moneyFromDecimal(String(req.body.amount)),
      productName: 'T-shirt',
      returnUrl: 'https://example.com/payments/callback',
      failureUrl: 'https://example.com/payments/callback',
    })

    orders.set(order.id, order)

    const { checkout, txnRef } = await gateway.createCheckout(order)
    res.json({ checkout, txnRef })
  } catch (error) {
    sendError(res, error)
  }
})
```

`createCheckout` returns two things:

- `checkout` — how to get the customer to the gateway:
  - `type: 'redirect'` → send them to `checkout.url`
  - `type: 'form_post'` → render `checkout.formParams` as hidden inputs and
    submit a form to `checkout.url`
- `txnRef` — the transaction reference; **persist `txnRef.id → order.id`**.

You need a small error helper so gateway errors become clean HTTP responses:

```ts
function sendError(res: Response, error: unknown): void {
  if (error instanceof NepalPaymentsError) {
    res
      .status(400)
      .json({ error: error.code ?? 'ERROR', message: error.message })
    return
  }
  console.error(error)
  res.status(500).json({ error: 'INTERNAL', message: 'unexpected error' })
}
```

---

## Step 5 — The callback route

This is where the customer lands after paying.

```ts
app.get('/payments/callback', async (req, res) => {
  try {
    // The query string is attacker-controlled. parseCallback only decodes it.
    const callback = gateway.parseCallback({ query: req.query })
    const payment = await processCallback(callback)
    res.json({ status: payment.status, orderId: payment.orderId })
  } catch (error) {
    sendError(res, error)
  }
})
```

Two lines, and both are security-critical:

- `parseCallback` **decodes but never trusts**. Anyone can hit this URL.
- `verify()` (inside `processCallback`) is the trust boundary. It rejects forged
  signatures, wrong amounts, and wrong orders with a typed error code.

---

## Step 6 — A dev-only simulator

The mock's checkout redirects to `https://mock.invalid/...`, which the browser
cannot reach. For local development we add a route that plays the part of both
the customer and the gateway:

```ts
// DEV ONLY — remove this route before production.
app.post('/dev/simulate', async (req, res) => {
  try {
    const txnRef = req.body.txnRef
    await gateway.pay(txnRef) // the customer pays
    const raw = await gateway.generateCallback(txnRef) // the gateway signs a callback
    const callback = gateway.parseCallback(raw)
    const payment = await processCallback(callback) // same path as production
    res.json({ status: payment.status, orderId: payment.orderId })
  } catch (error) {
    sendError(res, error)
  }
})
```

Because it calls `processCallback`, the simulator exercises the **same** code
path as a real callback. Your tests stay honest.

Finally, wire up the middleware and start the server:

```ts
const app = express()
app.use(express.json())

// ...routes...

const port = Number(process.env.PORT ?? 3000)
app.listen(port, () => console.log(`listening on http://localhost:${port}`))
```

---

## Step 7 — Run it end to end

Start the server:

```bash
pnpm dev
```

In another terminal, create a checkout:

```bash
curl -s -X POST localhost:3000/checkout \
  -H 'content-type: application/json' \
  -d '{"orderId":"ORDER-2001","amount":"230.00"}'
```

```json
{
  "checkout": {
    "type": "redirect",
    "url": "https://mock.invalid/pay/code/mock_e9058e03a24152706c"
  },
  "txnRef": { "id": "mock_e9058e03a24152706c", "gateway": "mock" }
}
```

Now simulate the customer paying (paste the `txnRef` from above):

```bash
curl -s -X POST localhost:3000/dev/simulate \
  -H 'content-type: application/json' \
  -d '{"txnRef":{"id":"mock_e9058e03a24152706c","gateway":"mock"}}'
```

```json
{ "status": "completed", "orderId": "ORDER-2001" }
```

Run the **same** command again. You get the same `completed` response, but the
server logs `Order ORDER-2001 paid — fulfilling` only **once**. That is your
idempotency guard working.

Try to cheat: edit the `amount` you send to `/checkout` to `"1.00"`, then
simulate. Nothing breaks at checkout time — but if you had verified against the
original order you would get `AMOUNT_MISMATCH`. This is why you verify against
the stored order.

---

## Step 8 — Switch to a real gateway (eSewa sandbox)

The whole point of the abstraction: the only thing that changes is how you build
the gateway, plus the field that identifies the order.

Install the adapter:

```bash
pnpm add @nepal-payments/esewa
```

Replace the mock with eSewa:

```ts
import { createEsewa } from '@nepal-payments/esewa'

const gateway = createEsewa({
  merchantCode: process.env.ESEWA_MERCHANT_CODE!,
  secret: process.env.ESEWA_SECRET!,
  environment: 'sandbox',
  successUrl: 'https://your-app.example/payments/callback',
  failureUrl: 'https://your-app.example/payments/callback',
})
```

And update how we find the order. eSewa puts your order id in
`transaction_uuid`:

```ts
const orderId = String(callback.data.transaction_uuid ?? '')
```

Every gateway names the order field differently — this is the one line you
adapt:

| Gateway    | Field in the callback holding your order id         |
| ---------- | --------------------------------------------------- |
| eSewa      | `transaction_uuid`                                  |
| connectIPS | `TXNID`                                             |
| Fonepay    | `PRN`                                               |
| Khalti     | none — look up `pidx` (`txnRef.id`) in your storage |
| Mock       | `order_id`                                          |

Get the sandbox credentials from eSewa, run `npay init` to see the required
environment variables, and follow
[Tutorial 3 — Going live](./03-go-live.md) to test and ship.

---

## Step 9 — Lock it in with a test

Tutorials are easy; regressions are not. Add one test that drives the full flow
without a network using the mock and `supertest`:

```bash
pnpm add -D vitest supertest @types/supertest
```

```ts
import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createMockGateway } from '@nepal-payments/mock'
import { createApp } from './server' // export the app, don't listen in tests

describe('checkout flow', () => {
  it('verifies and fulfills exactly once', async () => {
    const app = createApp(createMockGateway({ secretKey: 'test' }))

    const created = await request(app)
      .post('/checkout')
      .send({ orderId: 'ORDER-1', amount: '100.00' })
      .expect(200)

    const txnRef = created.body.txnRef

    const first = await request(app).post('/dev/simulate').send({ txnRef })
    const second = await request(app).post('/dev/simulate').send({ txnRef })

    expect(first.body.status).toBe('completed')
    expect(second.body.status).toBe('completed')
  })
})
```

To make `server.ts` testable, split it: put the routes in a `createApp(gateway)`
function that **returns** the app, and call `app.listen(...)` in a separate
entry file. The runnable [`apps/express-example`](../../apps/express-example)
does exactly this — `src/app.ts` builds the app, `src/server.ts` listens.

---

## Step 10 — Recap

You built the production shape of a payment integration:

```text
POST /checkout          → createOrder + createCheckout (+ persist txnRef)
GET  /payments/callback → parseCallback → verify → idempotent fulfill
```

The rules that make it safe:

1. Persist the order server-side; pass it back as `expected`.
2. Only trust `verify()` — never the callback payload's status.
3. Fulfill only on `completed`, and exactly once.

## What's next

- [Tutorial 3 — Going live](./03-go-live.md): real credentials, sandbox
  testing, and the production checklist.
- Make fulfillment durable with a real
  [`PaymentStore`](../persistence.md).
- Handle lost callbacks with [reconciliation](../reconciliation.md).
