# Khalti (ePayment)

REST-redirect integration for Khalti ePayment via `@nepal-payments/khalti`.

> Protocol research and endpoint verification live in
> [research/khalti.md](./research/khalti.md).

## Install

```bash
pnpm add @nepal-payments/core @nepal-payments/khalti
```

## Flow

```
createCheckout ──► redirect browser to payment_url
      │              (server calls Khalti /initiate/ with your secret)
      ▼
customer pays on Khalti ──► returns to your return_url with ?pidx=...
      │
      ▼
parseCallback ──► verify (Khalti /lookup/) ──► fulfill
```

Khalti requires a **server-side lookup** to confirm every payment; the redirect
query string alone is not trusted.

## Configure

```ts
import { createKhalti } from '@nepal-payments/khalti'

const gateway = createKhalti({
  secretKey: process.env.KHALTI_SECRET_KEY!,
  environment: 'sandbox', // 'sandbox' | 'production'
  returnUrl: 'https://example.com/payments/callback',
  websiteUrl: 'https://example.com',
})
```

| Option        | Required | Description                                 |
| ------------- | -------- | ------------------------------------------- |
| `secretKey`   | yes      | Khalti secret key (sent as `Authorization`) |
| `environment` | yes      | `'sandbox'` or `'production'`               |
| `returnUrl`   | no\*     | Fallback for `order.returnUrl`              |
| `websiteUrl`  | no       | Defaults to the origin of the return URL    |
| `initiateUrl` | no       | Override the initiate endpoint              |
| `lookupUrl`   | no       | Override the lookup endpoint                |
| `timeoutMs`   | no       | HTTP timeout (default `10000`)              |
| `fetch`       | no       | Custom `fetch` (testing/proxies)            |

\* A return URL is required, from config or the order.

## Create a checkout (redirect)

```ts
import { createOrder, moneyFromDecimal } from '@nepal-payments/core'

const order = createOrder({
  id: 'ORDER-1001',
  amount: moneyFromDecimal('100.00'),
  customerName: 'Sita Rai',
  customerEmail: 'sita@example.com',
  customerPhone: '9800000000',
})

const { checkout, txnRef } = await gateway.createCheckout(order)
// checkout.type === 'redirect'
// redirect the browser to checkout.url
```

Per-checkout overrides:

```ts
await gateway.createCheckout(order, {
  returnUrl: 'https://example.com/checkout/done',
  websiteUrl: 'https://store.example.com',
  purchaseOrderName: 'Summer T-shirt',
})
```

Notes:

- Khalti requires at least **Rs. 10** (1000 paisa) and at most 2 decimal places.
- `purchase_order_name` falls back to `order.productName`, then
  `order.description`, then `order.id`.
- `customer_info` is built from the order's `customerName`, `customerEmail`,
  and `customerPhone`.

## Handle the callback

Khalti redirects to your return URL with query parameters (most importantly
`pidx`).

```ts
const callback = gateway.parseCallback({ query: req.query })
// callback.data.pidx -> the payment identifier
```

## Verify

`verify()` checks:

1. the callback is tagged `khalti` (`GATEWAY_MISMATCH`);
2. a well-formed `pidx` (`MALFORMED_CALLBACK`);
3. the amount and `purchase_order_id` against `expected`;
4. the **Khalti lookup API** status, refusing when it does not report success.

```ts
const payment = await gateway.verify(callback, { expected: order })
```

The sealed `txnRef.id` is the `pidx`.

## Status lookup

```ts
const payment = await gateway.status(txnRef, { expected: order })
payment.status
```

## Status mapping

| Khalti raw      | Unified     |
| --------------- | ----------- |
| `Completed`     | `completed` |
| `Pending`       | `pending`   |
| `Initiated`     | `pending`   |
| `User canceled` | `canceled`  |
| `Expired`       | `expired`   |
| `Refunded`      | `unknown`   |

## See also

- [Overview & quickstart](../README.md)
- [Errors](./errors.md) · [Troubleshooting](./troubleshooting.md)
- [Research: Khalti](./research/khalti.md)
