# Fonepay

GET-redirect integration for the Fonepay merchant gateway via
`@nepal-payments/fonepay`.

> Protocol research and DV field order live in
> [research/fonepay.md](./research/fonepay.md). This page is the integration
> guide.

## Install

```bash
pnpm add @nepal-payments/core @nepal-payments/fonepay
```

## Flow

```
createCheckout (redirect) ──► browser GETs the signed Fonepay URL
        │
        ▼
Fonepay redirects to returnUrl?PRN=…&RC=…&DV=…   (signed)
        │
        ▼
parseCallback({ query }) ──► verify() ──► DV + amount + order → VerifiedPayment
```

The callback carries a signed `DV`, so `verify()` authenticates it locally and
(by default) also confirms a completed payment against Fonepay's
`verificationMerchant` API.

## Configure

```ts
import { createFonepay } from '@nepal-payments/fonepay'

const gateway = createFonepay({
  merchantCode: process.env.FONEPAY_PID!,
  secretKey: process.env.FONEPAY_SECRET!,
  environment: 'sandbox', // 'sandbox' | 'production'
  returnUrl: 'https://shop.example/payments/fonepay/return',
  remarks1: 'Order payment', // optional default R1
  remarks2: 'N/A', // optional default R2
})
```

| Option                  | Required | Description                                              |
| ----------------------- | -------- | -------------------------------------------------------- |
| `merchantCode`          | yes      | Fonepay merchant code (`PID`)                            |
| `secretKey`             | yes      | Shared HMAC-SHA512 secret used for the DV                |
| `environment`           | yes      | `'sandbox'` or `'production'`                            |
| `returnUrl`             | no       | Fallback `RU` when neither options nor the order set one |
| `remarks1` / `remarks2` | no       | Fallback `R1` / `R2` (default `R2` is `N/A`)             |
| `serverVerification`    | no       | Call `verificationMerchant` on verify (default `true`)   |
| `requestUrl`            | no       | Override the initiation endpoint                         |
| `verificationUrl`       | no       | Override the `verificationMerchant` endpoint             |
| `timeoutMs`             | no       | Server API timeout (default `10000`)                     |
| `now`                   | no       | Clock override (testing)                                 |
| `fetch`                 | no       | Custom `fetch` (testing/proxies)                         |

## Create a checkout (redirect)

```ts
import { createOrder, moneyFromDecimal } from '@nepal-payments/core'

const order = createOrder({
  id: 'ORDER-1001', // used as PRN: 3–25 chars, no spaces or commas
  amount: moneyFromDecimal('100.00'),
  returnUrl: 'https://shop.example/payments/fonepay/return',
})

const { checkout, txnRef } = await gateway.createCheckout(order)
```

`checkout` for Fonepay is a redirect:

```ts
{
  type: 'redirect',
  url: 'https://dev-clientapi.fonepay.com/api/merchantRequest?PID=…&MD=P&PRN=…&AMT=100.00&CRN=NPR&DT=…&R1=…&R2=N/A&RU=…&DV=…',
}
```

`AMT` is a 2-decimal NPR string (`Money` with precision `0` is scaled
automatically). `R1` defaults to the order description (or `Order <id>`), `R2`
to `N/A`; both are overridable per call and may not contain a comma:

```ts
await gateway.createCheckout(order, { remarks1: 'Invoice #42' })
```

## Handle the callback

Fonepay appends the signed result to your return URL.

```ts
const callback = gateway.parseCallback({ query: req.query })
```

## Verify

`verify()` checks, in order:

1. the callback is tagged `fonepay` (`GATEWAY_MISMATCH` otherwise);
2. `PRN` and `DV` are present (`MALFORMED_CALLBACK`);
3. the response `DV` matches a locally recomputed HMAC-SHA512
   (`SIGNATURE_MISMATCH`), compared in constant time;
4. `PID` and `PRN` match the configured merchant and the expected order
   (`ORDER_MISMATCH`);
5. for a completed callback, `P_AMT` equals `expected.amount`
   (`AMOUNT_MISMATCH`);
6. when `serverVerification` is enabled, a completed claim is confirmed against
   `verificationMerchant`; a disagreement downgrades the sealed status.

```ts
const payment = await gateway.verify(callback, { expected: order })
```

Set `serverVerification: false` for a DV-only integration (no server-to-server
call). The callback status maps as follows: `RC=successful` → `completed`,
`RC=failed` → `failed`, `RC=cancel` → `canceled`, otherwise `unknown`.

## Status lookup

```ts
const payment = await gateway.status(txnRef, { expected: order })
payment.status // 'completed' | 'failed' | 'canceled' | 'unknown'
```

`status()` calls `verificationMerchant`. Fonepay's lookup requires the amount,
so `expected` is mandatory — unlike connectIPS, an amount cannot be recovered
from a bare reference.

## Status mapping

| Fonepay                                              | Unified     |
| ---------------------------------------------------- | ----------- |
| `RC=successful` (`PS≠false`)                         | `completed` |
| `RC=failed` / `PS=false`                             | `failed`    |
| `RC=cancel`                                          | `canceled`  |
| `verificationMerchant` reports failure after success | `failed`    |
| anything unknown                                     | `unknown`   |

## See also

- [Getting started](./getting-started.md)
- [Errors](./errors.md) · [Troubleshooting](./troubleshooting.md)
- [Research: Fonepay](./research/fonepay.md)
