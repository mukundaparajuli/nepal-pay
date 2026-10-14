# eSewa (ePay V2)

Form-POST integration for eSewa ePay V2 via `@nepal-payments/esewa`.

> Protocol research and endpoint verification live in
> [research/esewa.md](./research/esewa.md). This page is the integration guide.

## Install

```bash
pnpm add @nepal-payments/core @nepal-payments/esewa
```

## Flow

```
createCheckout (form_post) ──► browser POSTs the form to eSewa
        │
        ▼
eSewa redirects to success_url?data=<base64 JSON>  (or failure_url)
        │
        ▼
parseCallback({ query }) ──► verify() ──► status API confirms → VerifiedPayment
```

There is no server-side initiation call: you build a signed form and hand it to
the browser.

## Configure

```ts
import { createEsewa } from '@nepal-payments/esewa'

const gateway = createEsewa({
  merchantCode: 'EPAYTEST', // your product/merchant code
  secret: process.env.ESEWA_SECRET!,
  environment: 'sandbox', // 'sandbox' | 'production'
  successUrl: 'https://example.com/payments/success',
  failureUrl: 'https://example.com/payments/failure',
})
```

| Option            | Required | Description                                   |
| ----------------- | -------- | --------------------------------------------- |
| `merchantCode`    | yes      | eSewa product code (signed as `product_code`) |
| `secret`          | yes      | eSewa signing secret                          |
| `environment`     | yes      | `'sandbox'` or `'production'`                 |
| `successUrl`      | no\*     | Fallback for `order.returnUrl`                |
| `failureUrl`      | no\*     | Fallback for `order.failureUrl`               |
| `checkoutFormUrl` | no       | Override the form endpoint                    |
| `statusCheckUrl`  | no       | Override the status endpoint                  |
| `timeoutMs`       | no       | Status API timeout (default `10000`)          |
| `fetch`           | no       | Custom `fetch` (testing/proxies)              |

\* A success and failure URL are required, from config or the order. Environment
URLs default to eSewa sandbox/production as documented in the research note.

## Create a checkout (form POST)

```ts
import { createOrder, moneyFromDecimal } from '@nepal-payments/core'

const order = createOrder({
  id: 'ORDER-1001', // used as transaction_uuid: alphanumeric / hyphens
  amount: moneyFromDecimal('100.00'),
})

const { checkout, txnRef } = await gateway.createCheckout(order)
```

`checkout` for eSewa is always

```ts
{
  type: 'form_post',
  url: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
  formParams: {
    amount, tax_amount, product_service_charge, product_delivery_charge,
    total_amount, transaction_uuid, product_code, success_url, failure_url,
    signed_field_names, signature,
  },
}
```

Render `formParams` as hidden inputs and submit the form. All fields are
strings; never compute or expose the signature yourself.

### Surcharges

Split the order total into components when needed. Surcharges are **subtracted**
from the order amount to produce `amount`; `total_amount` stays the full order
amount.

```ts
await gateway.createCheckout(order, {
  surcharges: { tax: '13.00', serviceCharge: '5.00' },
})
```

Surcharges must be NPR with 2 decimal places.

## Handle the callback

eSewa redirects to your success URL with `?data=<base64 JSON>`.

```ts
const callback = gateway.parseCallback({ query: req.query })
```

## Verify

`verify()` checks, in order:

1. the callback is tagged `esewa` (`GATEWAY_MISMATCH` otherwise);
2. the HMAC signature over `signed_field_names` (`SIGNATURE_MISMATCH`);
3. the amount against `expected.amount` (`AMOUNT_MISMATCH`);
4. `transaction_uuid` against `expected.id` (`ORDER_MISMATCH`);
5. `product_code` against your `merchantCode` (`ORDER_MISMATCH`);
6. for `status === 'COMPLETE'`, that the **status API agrees** and that
   `ref_id` matches `transaction_code` (otherwise `UNKNOWN_TRANSACTION` or
   `INVALID_STATUS`).

```ts
const payment = await gateway.verify(callback, { expected: order })
```

For a `COMPLETE` callback the sealed `txnRef.id` is eSewa's `transaction_code`.

## Status lookup

Confirm a transaction directly (for reconciliation or when a callback is
missing) with `status()`:

```ts
const payment = await gateway.status(txnRef, { expected: order })
payment.status // 'completed' | 'pending' | ...
```

Pass `expected` to also verify amount and order.

## Status mapping

| eSewa raw                      | Unified     |
| ------------------------------ | ----------- |
| `COMPLETE`                     | `completed` |
| `PENDING`                      | `pending`   |
| `CANCELED`                     | `canceled`  |
| `NOT_FOUND`                    | `unknown`   |
| `FULL_REFUND`/`PARTIAL_REFUND` | `unknown`   |

## See also

- [Getting started](./getting-started.md)
- [Errors](./errors.md) · [Troubleshooting](./troubleshooting.md)
- [Research: eSewa](./research/esewa.md)
