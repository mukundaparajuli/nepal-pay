# connectIPS (NCHL)

Form-POST integration for the NCHL connectIPS merchant gateway via
`@nepal-payments/connectips`.

> Protocol research and endpoint verification live in
> [research/connectips.md](./research/connectips.md). This page is the
> integration guide.

## Install

```bash
pnpm add @nepal-payments/core @nepal-payments/connectips
```

## Convert your CREDITOR.pfx

NCHL provides an RSA credential as a PKCS#12 archive. WebCrypto cannot read it,
so convert it once to PKCS#8. This is Node-only code behind a subpath import so
browser bundles never pull in `node-forge`.

```bash
npay connectips import-pfx ./CREDITOR.pfx --out ./creditor.key
# password is read from NPAY_PFX_PASSWORD or --password-stdin, never argv
```

```ts
import { readFileSync } from 'node:fs'
import { pfxToPkcs8Pem } from '@nepal-payments/connectips/pfx'

const keyPem = pfxToPkcs8Pem(
  new Uint8Array(readFileSync('CREDITOR.pfx')),
  process.env.NPAY_PFX_PASSWORD!
).privateKeyPem
```

## Flow

```
createCheckout (form_post) ──► browser POSTs the form to connectIPS
        │
        ▼
connectIPS redirects to success_url?TXNID=<txn>  (or failure_url)
        │
        ▼
parseCallback({ query }) ──► verify() ──► validatetxn confirms → VerifiedPayment
```

The callback carries **only `TXNID`**, so `verify()` always calls the
server-to-server `validatetxn` API to establish authenticity and amount.

## Configure

```ts
import { createConnectIps } from '@nepal-payments/connectips'

const gateway = createConnectIps({
  merchantId: process.env.CONNECTIPS_MERCHANT_ID!,
  appId: process.env.CONNECTIPS_APP_ID!,
  appName: process.env.CONNECTIPS_APP_NAME!,
  password: process.env.CONNECTIPS_PASSWORD!,
  privateKey: process.env.CONNECTIPS_PRIVATE_KEY_PEM!, // PKCS#8
  environment: 'sandbox', // 'sandbox' | 'production'
  remarks: 'Order payment', // optional default REMARKS
  particulars: 'Order payment', // optional default PARTICULARS
})
```

| Option          | Required | Description                                    |
| --------------- | -------- | ---------------------------------------------- |
| `merchantId`    | yes      | NCHL merchant id (`MERCHANTID`)                |
| `appId`         | yes      | NCHL app id; also the Basic-auth user name     |
| `appName`       | yes      | Application name (`APPNAME`)                   |
| `password`      | yes      | Basic-auth password for the server APIs        |
| `privateKey`    | yes      | PKCS#8 RSA private key PEM from `CREDITOR.pfx` |
| `environment`   | yes      | `'sandbox'` or `'production'`                  |
| `remarks`       | no       | Default `REMARKS` (≤ 50 chars)                 |
| `particulars`   | no       | Default `PARTICULARS` (≤ 100 chars)            |
| `baseUrl`       | no       | Override the environment base URL              |
| `loginUrl`      | no       | Override the login-page endpoint               |
| `validationUrl` | no       | Override the `validatetxn` endpoint            |
| `txnDetailUrl`  | no       | Override the `gettxndetail` endpoint           |
| `timeoutMs`     | no       | Server API timeout (default `10000`)           |
| `now`           | no       | Clock override (testing)                       |
| `fetch`         | no       | Custom `fetch` (testing/proxies)               |

## Create a checkout (form POST)

```ts
import { createOrder, moneyFromDecimal } from '@nepal-payments/core'

const order = createOrder({
  id: 'ORDER-1001', // used as TXNID: 1–20 chars, A–Z a–z 0–9 _ -
  amount: moneyFromDecimal('100.00'),
})

const { checkout, txnRef } = await gateway.createCheckout(order)
```

`checkout` for connectIPS is always

```ts
{
  type: 'form_post',
  url: 'https://uat.connectips.com/connectipswebgw/loginpage',
  formParams: {
    MERCHANTID, APPID, APPNAME, TXNID, TXNDATE, TXNCRNCY, TXNAMT,
    REFERENCEID, REMARKS, PARTICULARS, TOKEN,
  },
}
```

Render `formParams` as hidden inputs and submit the form. `TXNAMT` is integer
paisa (`Money` with precision `0` is scaled automatically). `REMARKS` defaults
to the order description, `PARTICULARS` to the product name, both overridable
per call:

```ts
await gateway.createCheckout(order, { remarks: 'Invoice #42' })
```

## Handle the callback

connectIPS appends `?TXNID=` to your registered success/failure URL.

```ts
const callback = gateway.parseCallback({ query: req.query })
```

## Verify

`verify()` checks, in order:

1. the callback is tagged `connectips` (`GATEWAY_MISMATCH` otherwise);
2. `TXNID` is present and well-formed (`MALFORMED_CALLBACK` / `INVALID_TXN_REF`);
3. `TXNID` equals `expected.id` (`ORDER_MISMATCH`);
4. the `validatetxn` response is for this transaction (`UNKNOWN_TRANSACTION`);
5. for a `SUCCESS` response, the returned amount equals `expected.amount`
   (`AMOUNT_MISMATCH`).

```ts
const payment = await gateway.verify(callback, { expected: order })
```

A disagreement between the (untrusted) callback and the server result cannot
occur, because the callback carries no status; the API response is the source of
truth. A `FAILED` result seals `failed`, and `ERROR` (not found / incomplete)
seals `unknown`.

## Status lookup

```ts
const payment = await gateway.status(txnRef, { expected: order })
payment.status // 'completed' | 'failed' | 'unknown'
```

`status()` calls `gettxndetail`. Without `expected` it reports the amount
returned by NCHL and uses the transaction id as the order id.

## Status mapping

| connectIPS raw                                | Unified     |
| --------------------------------------------- | ----------- |
| `SUCCESS` (credit `000`/`999`/`DEFER`/absent) | `completed` |
| `SUCCESS` with a non-settling `creditStatus`  | `failed`    |
| `FAILED`                                      | `failed`    |
| `ERROR` / anything unknown                    | `unknown`   |

## See also

- [Getting started](./getting-started.md)
- [Errors](./errors.md) · [Troubleshooting](./troubleshooting.md)
- [Research: connectIPS](./research/connectips.md)
