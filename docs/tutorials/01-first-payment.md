# Tutorial 1 — Your first payment (no credentials)

**Goal:** run the entire payment lifecycle on your own machine and watch it go
from "order created" to "payment verified" — without registering with any bank
or gateway.

**Time:** about 5 minutes.

**What you need:** Node.js 20+ and a terminal. No accounts, no API keys.

We use the [`@nepal-payments/mock`](../testing.md) gateway. It behaves exactly
like a real gateway (`createCheckout` → customer pays → `parseCallback` →
`verify`) but lives entirely in memory, so you can experiment freely.

---

## Step 1 — Create a project

```bash
mkdir nepal-payments-demo
cd nepal-payments-demo
pnpm init
pnpm add @nepal-payments/core @nepal-payments/mock
pnpm add -D tsx typescript
```

`@nepal-payments/core` holds the shared types, the `Money` helpers, and the
error classes. `@nepal-payments/mock` is the fake gateway. `tsx` lets us run a
`.ts` file without a build step.

> **Running TypeScript.** If you are on Node 22.6+, you can skip `tsx` and run
> `node --experimental-strip-types first-payment.ts`. The tutorials use `tsx`
> because it works on every supported Node version.

---

## Step 2 — Write your first payment

Create a file called `first-payment.ts`:

```ts
import { createOrder, moneyFromDecimal } from '@nepal-payments/core'
import { createMockGateway } from '@nepal-payments/mock'

// 1. Create a gateway once and reuse it. The secret signs callbacks.
const gateway = createMockGateway({ secretKey: 'dev-secret' })

// 2. Describe what the customer is buying. Money is exact, never a float.
const order = createOrder({
  id: 'ORDER-1001',
  amount: moneyFromDecimal('100.00'),
  productName: 'T-shirt',
})

// 3. Ask the gateway for a checkout. `txnRef` identifies this attempt.
const { checkout, txnRef } = await gateway.createCheckout(order)
console.log('CHECKOUT:', checkout)
console.log('TXNREF:  ', txnRef)

// 4. The customer pays on the gateway. The mock does this in one call; a real
//    gateway does it in the browser.
await gateway.pay(txnRef)

// 5. The gateway hands back a signed callback. This is the untrusted part.
const raw = await gateway.generateCallback(txnRef)
const callback = gateway.parseCallback(raw)
console.log('CALLBACK:', callback.data)

// 6. verify() is the single trust boundary. Pass the order back in.
const payment = await gateway.verify(callback, { expected: order })
console.log('PAYMENT: ', {
  orderId: payment.orderId,
  status: payment.status,
  amount: payment.amount,
})
```

---

## Step 3 — Run it

```bash
pnpm exec tsx first-payment.ts
```

You should see something like this (the transaction id is random each run):

```text
CHECKOUT: { type: 'redirect', url: 'https://mock.invalid/pay/code/mock_84dd817c0344cada67' }
TXNREF:   { id: 'mock_84dd817c0344cada67', gateway: 'mock' }
CALLBACK: {
  txn_id: 'mock_84dd817c0344cada67',
  order_id: 'ORDER-1001',
  amount: '10000',
  status: 'completed',
  signature: '2c2604b2d1ed672b1c54fc0b4ba25f7a484d66844cf689dedd1a512ec9b6946b'
}
PAYMENT:  {
  orderId: 'ORDER-1001',
  status: 'completed',
  amount: { amount: 10000n, currency: 'NPR', precision: 2 }
}
```

That's a complete payment. The rest of this tutorial explains what just
happened, so you can do it with a real gateway.

---

## Step 4 — What each line did

| Step | Call                                   | What it really does                                             |
| ---- | -------------------------------------- | --------------------------------------------------------------- |
| 2    | `createOrder({…})`                     | Validates the id, amount, and URLs; returns a frozen order.     |
| 3    | `gateway.createCheckout(order)`        | Builds the gateway payload (and signature) + a `TxnRef`.        |
| 4    | `gateway.pay(txnRef)`                  | Stands in for the customer paying in their browser.             |
| 5    | `gateway.parseCallback(raw)`           | Decodes the payload. **Trusts nothing yet.**                    |
| 5    | `gateway.generateCallback(txnRef)`     | Produces the gateway's redirect (only the mock has this).       |
| 6    | `gateway.verify(callback, {expected})` | Checks signature, order, and amount; seals a `VerifiedPayment`. |

### The one rule to remember

> **Only `verify()` creates a `VerifiedPayment`.** The callback payload is
> attacker-controlled — anyone can craft a query string. Never read
> `callback.data` to decide that an order is paid; always call
> `verify(callback, { expected: order })` and act on its result.

`verify()` re-checks four things you must not skip:

1. **Gateway tag** — the callback is really for this adapter's gateway.
2. **Signature** — the payload was signed with your shared secret (constant-time
   comparison).
3. **Order** — `order_id` / `transaction_uuid` matches the order you expect.
4. **Amount** — the gateway's amount equals what you charged.

If any check fails, `verify()` throws a `NepalPaymentsError` with a
machine-readable `.code` (`SIGNATURE_MISMATCH`, `AMOUNT_MISMATCH`,
`ORDER_MISMATCH`, …). See [errors.md](../errors.md).

### Why `amount` shows `10000n`

`Money` stores the exact **minor unit** count as a `bigint`. `100.00 NPR` is
`10000` paisa. There is no floating-point rounding error anywhere in the SDK.
Use `moneyToDecimal(payment.amount)` when you need `'100.00'` back for display.

---

## Step 5 — Break it on purpose

The security rules are easier to believe once you have seen them fire. Edit
`first-payment.ts` and try each of these.

### 5a. A forged signature is rejected

Change the gateway to hand out a tampered callback:

```ts
const gateway = createMockGateway({
  secretKey: 'dev-secret',
  scenario: 'invalid-signature',
})
```

Run again. `verify()` now throws:

```text
NepalPaymentsError: Callback signature does not match
  code: 'SIGNATURE_MISMATCH'
```

The customer cannot fake a payment by editing the query string.

### 5b. A tampered amount is rejected

Keep the normal `success` scenario, but change the expected order's amount after
checkout so it no longer matches what the gateway reported:

```ts
const tamperedOrder = createOrder({
  id: 'ORDER-1001',
  amount: moneyFromDecimal('1.00'), // smaller than the 100.00 that was paid
})
const payment = await gateway.verify(callback, { expected: tamperedOrder })
```

This throws `AMOUNT_MISMATCH`. Your server always compares against the amount
**you** stored, never the amount in the callback.

### 5c. A missing callback is not a lost sale

Real callbacks get lost. Switch to the `abandoned` scenario (the customer never
pays) and add a reconciliation step:

```ts
import { createOrder, moneyFromDecimal, reconcile } from '@nepal-payments/core'
import { createMockGateway } from '@nepal-payments/mock'

const gateway = createMockGateway({
  secretKey: 'dev-secret',
  scenario: 'abandoned', // the customer closes the tab
})

const order = createOrder({
  id: 'ORDER-1002',
  amount: moneyFromDecimal('50.00'),
})
const { txnRef } = await gateway.createCheckout(order)

// No callback ever arrives. Ask the gateway directly instead of waiting.
const result = await reconcile(gateway, { order, txnRef }, { maxAttempts: 3 })
console.log(result.resolved, result.status)
```

Output:

```text
false pending
```

`resolved` is `false` because the payment never reached a terminal status
(`completed`, `failed`, `canceled`, or `expired`) — the customer simply walked
away.

`reconcile()` is one bounded run — it does **not** schedule itself. Call it from
your own cron or queue. See [reconciliation.md](../reconciliation.md).

---

## Step 6 — Recap

You just ran the whole lifecycle:

```text
createOrder → createCheckout → (customer pays) → parseCallback → verify → fulfill
```

The only two things your server has to persist are:

- the **order** (`order.id`, `order.amount`, …), and
- the mapping from **`txnRef.id` → `order.id`**.

Everything else is derived. That is what makes the SDK stateless.

## What's next

- [Tutorial 2 — A checkout page with Express →](./02-express-checkout.md) puts
  this into a real HTTP server with routes and idempotent fulfillment.
- Want the concepts without the steps? Read the
  [overview and quickstart](../../README.md).
- Ready for real money? Jump to [Tutorial 3 — Going live](./03-go-live.md).
