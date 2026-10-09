# Getting Started

This guide walks through the full payment lifecycle with `@nepal-payments/*`.
If you just want to see it work, start with the [README quickstart](../README.md).

## Install

```bash
pnpm add @nepal-payments/core @nepal-payments/esewa
```

Add the gateway packages you use. `@nepal-payments/core` ships the shared types,
money helpers, and error classes.

## The lifecycle

```
create gateway
      │
      ▼
create order ──► create checkout ──► redirect / render form
                                              │
                                              ▼
                        callback ──► parseCallback ──► verify ──► fulfill
```

The SDK is **stateless**. It does not store orders or sessions. You persist the
order and the mapping from `txnRef.id` back to your order, then pass the order
back into `verify()` as the `expected` value.

## Core concepts

### Money

Money is an exact integer count of the minor unit backed by `bigint` — never a
float.

```ts
import { moneyFromDecimal, moneyToDecimal } from '@nepal-payments/core'

const amount = moneyFromDecimal('100.50') // { amount: 10050n, currency: 'NPR', precision: 2 }
moneyToDecimal(amount) // '100.50'
```

Use `moneyFromDecimal('100.50')` for user input, `createMoney(10050n)` for
integer minor units, and `moneyToJSON`/`moneyFromJSON` for storage.

### Order

An `Order` is the merchant-side source of truth for a payment.

```ts
const order = createOrder({
  id: 'ORDER-1001',
  amount: moneyFromDecimal('100.00'),
  productName: 'T-shirt',
  customerEmail: 'buyer@example.com',
  returnUrl: 'https://example.com/payments/success',
  failureUrl: 'https://example.com/payments/failure',
})
```

`createOrder` validates the id, requires a positive amount, checks URLs, and
returns a frozen copy. It throws `PaymentError` (a `NepalPaymentsError`) with a
machine-readable `.code` such as `INVALID_ORDER_ID` or `INVALID_URL`.

### Gateway

A gateway implements the `GatewayAdapter` contract:

```ts
interface GatewayAdapter {
  readonly name: PaymentMethod
  createCheckout(order: Order): Promise<CheckoutResult>
  parseCallback(request: RawCallbackRequest): UnverifiedCallback
  verify(
    callback: UnverifiedCallback,
    options: { expected: Order }
  ): Promise<VerifiedPayment>
  status(txnRef: TxnRef, options?): Promise<VerifiedPayment>
}
```

Create one adapter per gateway and reuse it.

```ts
import { createEsewa } from '@nepal-payments/esewa'

const gateway = createEsewa({
  merchantCode: process.env.ESEWA_MERCHANT_CODE!,
  secret: process.env.ESEWA_SECRET!,
  environment: 'sandbox',
  successUrl: 'https://example.com/payments/success',
  failureUrl: 'https://example.com/payments/failure',
})
```

### Checkout

`createCheckout(order)` returns the redirect/form details plus a `TxnRef`.

```ts
const { checkout, txnRef } = await gateway.createCheckout(order)
```

- `checkout.type === 'form_post'` (eSewa) — render `checkout.formParams` as
  hidden inputs in a form that POSTs to `checkout.url`.
- `checkout.type === 'redirect'` (Khalti) — send the browser to `checkout.url`.

`txnRef` identifies the transaction (`{ id, gateway }`). **Persist
`txnRef.id → order.id`** before redirecting. You need it when the callback
arrives.

### Callback

`parseCallback` decodes the gateway payload into an `UnverifiedCallback`. It
does not trust or validate anything yet — never read `callback.data` for
business decisions.

```ts
const callback = gateway.parseCallback({ query: req.query })
// eSewa:  ?data=<base64 JSON>          -> pass the whole query object
// Khalti: ?pidx=...&status=...&...     -> pass the whole query object
```

`parseCallback` throws `PaymentError` with code `MALFORMED_CALLBACK` when the
payload is missing or malformed.

### Verify

`verify()` is the single trust boundary. It validates the gateway tag, the
expected order, the amount, and the signature in constant time, then (for eSewa
`COMPLETE`) confirms against the gateway status API before sealing a
`VerifiedPayment`.

```ts
const payment = await gateway.verify(callback, { expected: order })
if (payment.status === 'completed') {
  // fulfill
}
```

On failure it throws `VerificationError` (a `NepalPaymentsError`) with codes
such as `SIGNATURE_MISMATCH`, `AMOUNT_MISMATCH`, `ORDER_MISMATCH`,
`UNKNOWN_TRANSACTION`, or `GATEWAY_MISMATCH`. See [errors.md](./errors.md) and
[troubleshooting.md](./troubleshooting.md).

### Fulfill

Fulfill only on `status === 'completed'`, and make fulfillment idempotent — the
same callback can arrive more than once.

```ts
if (payment.status === 'completed') {
  const updated = await db.markPaid(payment.orderId) // UPDATE ... WHERE status != 'paid'
  if (updated) await sendReceipt(payment.orderId)
}
```

## A complete Express handler

```ts
import express from 'express'
import {
  createOrder,
  moneyFromDecimal,
  NepalPaymentsError,
} from '@nepal-payments/core'
import { createEsewa } from '@nepal-payments/esewa'

const gateway = createEsewa({
  merchantCode: process.env.ESEWA_MERCHANT_CODE!,
  secret: process.env.ESEWA_SECRET!,
  environment: 'sandbox',
  successUrl: 'https://example.com/payments/success',
  failureUrl: 'https://example.com/payments/failure',
})

const app = express()
app.use(express.json())

app.post('/checkout', async (req, res) => {
  const order = createOrder({
    id: req.body.orderId,
    amount: moneyFromDecimal(req.body.amount),
  })
  await db.saveOrder(order) // your storage
  const { checkout, txnRef } = await gateway.createCheckout(order)
  await db.linkTxn(txnRef.id, order.id) // your storage
  res.json({ checkout, txnRef })
})

app.get('/payments/callback', async (req, res) => {
  try {
    const callback = gateway.parseCallback({ query: req.query })
    const orderId = await db.orderIdForTxn(
      String(callback.data.transaction_uuid)
    )
    if (!orderId) return res.status(404).json({ error: 'UNKNOWN_CHECKOUT' })
    const order = await db.getOrder(orderId)
    const payment = await gateway.verify(callback, { expected: order })
    if (payment.status === 'completed') await fulfill(payment.orderId)
    res.json({ status: payment.status, orderId: payment.orderId })
  } catch (error) {
    if (error instanceof NepalPaymentsError) {
      return res.status(400).json({ error: error.code, message: error.message })
    }
    res.status(500).json({ error: 'INTERNAL' })
  }
})
```

Runnable equivalents live in [`apps/express-example`](../apps/express-example),
[`apps/hono-example`](../apps/hono-example), and
[`apps/next-example`](../apps/next-example).

## Choosing a gateway

| Gateway | Flow      | Docs                       |
| ------- | --------- | -------------------------- |
| eSewa   | form POST | [esewa.md](./esewa.md)     |
| Khalti  | redirect  | [khalti.md](./khalti.md)   |
| Mock    | redirect  | [testing.md](./testing.md) |

ConnectIPS and Fonepay are present in the `PaymentMethod` union but not yet
implemented — see [`docs/gateways/`](./gateways/) for research notes.

## Next steps

- Wire up a real gateway: [eSewa](./esewa.md) · [Khalti](./khalti.md)
- Test locally with the [mock gateway](./testing.md)
- Understand the trust model: [security.md](./security.md)
