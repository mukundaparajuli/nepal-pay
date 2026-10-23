# Nepal Payments

A stateless, framework-agnostic TypeScript SDK for Nepali payment gateways —
**eSewa**, **Khalti**, **connectIPS**, and **Fonepay** — plus a mock gateway for
tests and local development.

- **Exact money.** Amounts are `bigint` minor units (`100.00 NPR` → `10000n`),
  never floating point.
- **Verify before trust.** Callbacks are untrusted; only `verify()` produces a
  sealed `VerifiedPayment`.
- **Stateless and dependency-free.** No framework, database, or session coupling.
- **One contract, every gateway.** The same lifecycle drives all gateways, so
  switching providers is a configuration change.

## Table of contents

- [Packages](#packages)
- [Requirements](#requirements)
- [Install](#install)
- [Quickstart](#quickstart)
- [Core API](#core-api)
- [Gateways](#gateways)
  - [eSewa](#esewa)
  - [Khalti](#khalti)
  - [connectIPS](#connectips)
  - [Fonepay](#fonepay)
  - [Mock](#mock)
- [CLI](#cli)
- [Testing](#testing)
- [Security](#security)
- [Errors](#errors)
- [Architecture](#architecture)
- [Development](#development)
- [Examples](#examples)
- [License](#license)

## Packages

| Package                      | Flow                          | Purpose                                                                          |
| ---------------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| `@nepal-payments/core`       | —                             | Types, `Money`, `Order`, errors, gateway contract, `reconcile()`, `PaymentStore` |
| `@nepal-payments/esewa`      | form POST                     | eSewa ePay V2                                                                    |
| `@nepal-payments/khalti`     | redirect + server lookup      | Khalti ePayment                                                                  |
| `@nepal-payments/connectips` | form POST + server validation | NCHL connectIPS                                                                  |
| `@nepal-payments/fonepay`    | GET redirect + HMAC-SHA512 DV | Fonepay                                                                          |
| `@nepal-payments/mock`       | redirect                      | In-memory gateway for tests and local development                                |
| `@nepal-payments/cli`        | —                             | The `npay` CLI: env scaffolding, offline smoke tests, fixture validation         |

Every gateway depends only on `@nepal-payments/core` (connectIPS also uses
`node-forge` to read `CREDITOR.pfx`). `core` has no runtime dependencies.

## Requirements

- **Node.js 18+** (20+ recommended). Also runs on Bun and in edge/Next.js server
  runtimes.
- The repo uses `pnpm`; consumers may use npm, yarn, or bun.

## Install

```bash
# core plus the gateway(s) you use
pnpm add @nepal-payments/core @nepal-payments/esewa
```

## Quickstart

The whole lifecycle, using eSewa. Every gateway follows the same shape:

```
install → create gateway → create order → create checkout
        → redirect/form → callback → verify → fulfill
```

### 1. Create a gateway

```ts
import { createEsewa } from '@nepal-payments/esewa'

const gateway = createEsewa({
  merchantCode: process.env.ESEWA_MERCHANT_CODE!,
  secret: process.env.ESEWA_SECRET!,
  environment: 'sandbox', // 'sandbox' | 'production'
  successUrl: 'https://example.com/payments/success',
  failureUrl: 'https://example.com/payments/failure',
})
```

Create one adapter per gateway and reuse it.

### 2. Create an order

Amounts are exact decimal strings — use `moneyFromDecimal`, never a float.

```ts
import { createOrder, moneyFromDecimal } from '@nepal-payments/core'

const order = createOrder({
  id: 'ORDER-1001', // 1–100 chars, alphanumeric / hyphens
  amount: moneyFromDecimal('100.00'),
  productName: 'T-shirt',
})
```

`createOrder` validates the id, requires a positive amount, checks URLs, and
returns a frozen copy. It throws `PaymentError` with a machine-readable `.code`
such as `INVALID_ORDER_ID` or `INVALID_URL`.

### 3. Create the checkout

```ts
const { checkout, txnRef } = await gateway.createCheckout(order)
// checkout.type === 'form_post' for eSewa
// checkout.url        -> eSewa endpoint
// checkout.formParams -> hidden form fields (including the signature)
// txnRef              -> { id, gateway }
```

Persist the `txnRef.id → order.id` mapping **before redirecting**. You need it
when the callback arrives.

### 4. Redirect or render the form

```ts
if (checkout.type === 'redirect') {
  res.redirect(checkout.url)
} else {
  res.send(`
    <form id="pay" method="POST" action="${checkout.url}">
      ${Object.entries(checkout.formParams)
        .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}">`)
        .join('')}
    </form>
    <script>document.getElementById('pay').submit()</script>
  `)
}
```

### 5. Handle the callback

Treat the raw query/body as untrusted and pass it through unchanged.

```ts
// GET /payments/callback?data=<base64>
const callback = gateway.parseCallback({ query: req.query })
```

### 6. Verify server-side

`verify()` re-checks the gateway, order, amount, and signature in constant time,
then confirms with the gateway before sealing the result.

```ts
const payment = await gateway.verify(callback, { expected: order })

payment.orderId // 'ORDER-1001'
payment.amount // Money
payment.status // 'completed' | 'pending' | 'failed' | ...
payment.txnRef // { id, gateway }
```

### 7. Fulfill

Fulfill only a sealed `completed` payment, and guard against duplicate callbacks.

```ts
if (payment.status === 'completed' && !alreadyFulfilled(payment.orderId)) {
  await markOrderPaid(payment.orderId, payment.txnRef)
}
```

## Core API

### Money

Money is an exact integer count of the minor unit, never a float.

```ts
interface Money {
  readonly amount: bigint // scaled minor units: 100.00 NPR => 10000n
  readonly currency: 'NPR'
  readonly precision: number // decimal places, e.g. 2
}
```

```ts
import {
  createMoney,
  moneyFromDecimal,
  moneyToDecimal,
  moneyToJSON,
  moneyFromJSON,
  addMoney,
  subtractMoney,
  multiplyMoney,
  compareMoney,
  moneyEquals,
  isMoney,
} from '@nepal-payments/core'

const amount = moneyFromDecimal('100.50') // { amount: 10050n, currency: 'NPR', precision: 2 }
moneyToDecimal(amount) // '100.50'
```

- `createMoney(amount, currency?, precision?)` — scaled minor-unit input.
  Number amounts must be safe integers.
- `moneyFromDecimal(decimal, currency?, precision?)` — decimal string input.
  Use this for user input.
- Arithmetic (`addMoney`, `subtractMoney`, `multiplyMoney`) requires matching
  currency **and** precision.
- `compareMoney` / `moneyEquals` are cross-precision and same-currency (`100`,
  `100.0`, and `100.00` are equal).
- `moneyToJSON` / `moneyFromJSON` produce an exact portable representation:
  `{ amount: "10000", currency: "NPR", precision: 2 }`.

### Order

```ts
interface Order {
  readonly id: string
  readonly amount: Money
  readonly description?: string
  readonly productName?: string
  readonly customerName?: string
  readonly customerEmail?: string
  readonly customerPhone?: string
  readonly metadata?: Readonly<Record<string, string>>
  readonly returnUrl?: string
  readonly failureUrl?: string
  readonly callbackUrl?: string
}

createOrder(input: Order): Order
```

### GatewayAdapter

Every gateway — real or mock — implements the same contract:

```ts
interface GatewayAdapter {
  readonly name: PaymentMethod // 'esewa' | 'khalti' | 'connectips' | 'fonepay' | 'mock'
  createCheckout(order: Order, options?): Promise<CheckoutResult>
  parseCallback(request: RawCallbackRequest): UnverifiedCallback
  verify(
    callback: UnverifiedCallback,
    options: { expected: Order }
  ): Promise<VerifiedPayment>
  status(txnRef: TxnRef, options?): Promise<VerifiedPayment>
}

interface CheckoutResult {
  readonly checkout: Checkout
  readonly txnRef: TxnRef
}
```

`verify()` **requires** `expected: Order`; verification is always bound to the
order you stored.

### Checkout and TxnRef

```ts
type Checkout =
  | {
      readonly type: 'redirect'
      readonly url: string
      readonly headers?: Record<string, string>
    }
  | {
      readonly type: 'form_post'
      readonly url: string
      readonly formParams: Record<string, string>
      readonly headers?: Record<string, string>
    }

interface TxnRef {
  readonly id: string
  readonly gateway: PaymentMethod
}
```

### Callback

`parseCallback` decodes the raw request into an `UnverifiedCallback`. It does
not trust or validate anything — never read `callback.data` for business
decisions.

```ts
interface RawCallbackRequest {
  readonly body?: unknown
  readonly query?: Record<string, unknown>
  readonly headers?: Record<string, string>
}

interface UnverifiedCallback {
  readonly gateway: PaymentMethod
  readonly data: Record<string, unknown>
  readonly headers?: Record<string, string>
  readonly body?: unknown
}

callbackFingerprint(callback): Promise<string> // stable SHA-256 for replay bookkeeping
```

### VerifiedPayment

Created **only** by `verify()` / `status()`.

```ts
interface VerifiedPayment {
  readonly orderId: string
  readonly amount: Money
  readonly status: PaymentStatus
  readonly txnRef: TxnRef
  readonly verifiedAt: Date
  readonly raw?: Record<string, unknown>
}

isVerifiedPayment(value): value is VerifiedPayment
isCompletedPayment(value): boolean
```

- The object (including `amount`, `txnRef`, `verifiedAt`, and a deep-cloned
  `raw`) is frozen. Extra input keys are dropped.
- The seal is a **type/accident barrier, not a cryptographic proof**. It is lost
  through JSON serialization and object spread. Persist and re-verify explicitly.
- The factory lives in `@nepal-payments/core/internal` and is not public API.

### PaymentStatus

Every gateway maps its raw states onto one set:

```
'pending' | 'completed' | 'failed' | 'canceled' | 'expired' | 'unknown'
```

Use `isPaymentStatus(value)` as a runtime guard.

### Reconcile

```ts
import { reconcile } from '@nepal-payments/core'

const result = await reconcile(
  gateway,
  { order, txnRef },
  {
    maxAttempts: 5, // default 3
    backoffMs: 250, // default 250, doubles per attempt
    maxBackoffMs: 5000,
    timeoutMs: 10_000,
    expiresAt: orderExpiresAt, // optional hard stop
  }
)

result.payment // last observed VerifiedPayment
result.status
result.attempts
result.resolved // true only for completed/failed/canceled/expired
result.reason // 'terminal' | 'exhausted' | 'timeout' | 'expired'
```

`reconcile()` retries while a payment is non-terminal (`pending` or `unknown`)
and stops on a terminal status, timeout, expiry, or attempt limit. It performs
one bounded run and **does not schedule itself** — drive it from your own queue
or cron.

### Persistence

`PaymentStore` is optional and database-agnostic. An in-memory implementation is
included for tests.

```ts
interface Payment {
  readonly orderId: string
  readonly amount: Money
  readonly status: PaymentStatus
  readonly txnRef: TxnRef
  readonly verifiedAt: Date
  readonly updatedAt: Date
  readonly raw?: Record<string, unknown>
}

interface PaymentStore {
  getPayment(orderId: string): Promise<Payment | null>
  savePayment(payment: Payment): Promise<void>
  acquireIdempotencyKey(key: string): Promise<boolean>
}

paymentFromVerified(payment: VerifiedPayment, now?: Date): Payment
createInMemoryPaymentStore(): InMemoryPaymentStore
```

- `savePayment` should upsert by `orderId`.
- `acquireIdempotencyKey` must atomically claim a key, returning `true` only for
  the first caller.
- `paymentFromVerified()` rejects anything `verify()` did not seal with
  `UNVERIFIED_PAYMENT`.

Serialization: `Money` stores a `bigint` and timestamps are `Date`, so do not
rely on plain `JSON.stringify`. Persist `amount.amount.toString()`,
`currency`, `precision`, and ISO date strings; read back with `createMoney()` and
`new Date()`.

```ts
// Idempotent fulfillment
const claimed = await store.acquireIdempotencyKey(payment.orderId)
if (!claimed) return
await store.savePayment(paymentFromVerified(payment))
if (payment.status === 'completed') await ship(payment.orderId)
```

### Crypto helpers

All signatures are compared in constant time:

```ts
constantTimeCompare(a, b): boolean
sha256(data): Promise<string>
hmacSha256(data, secret): Promise<string>
hmacSha512(data, secret): Promise<string>
verifySha256(data, expectedHash): Promise<boolean>
verifyHmacSha256(data, secret, expectedSignature): Promise<boolean>
verifyHmacSha512(data, secret, expectedSignature): Promise<boolean>
safeBase64Encode(data): string
safeBase64Decode(encoded): string // strict, throws INVALID_BASE64
isValidOrderId(orderId): boolean // 1..100 chars
```

RSA helpers (`importPkcs8PrivateKey`, `importSpkiPublicKey`, `rsaSha256Sign`,
`rsaSha256Verify`) are used by connectIPS.

## Gateways

Each gateway is a config object plus the shared lifecycle.

### eSewa

Form-POST integration for eSewa ePay V2. There is no server-side initiation
call: build a signed form and hand it to the browser. Checkout type:
`form_post`.

```ts
import { createEsewa } from '@nepal-payments/esewa'

const gateway = createEsewa({
  merchantCode: 'EPAYTEST', // signed as product_code
  secret: process.env.ESEWA_SECRET!,
  environment: 'sandbox',
  successUrl: 'https://example.com/payments/success',
  failureUrl: 'https://example.com/payments/failure',
})
```

| Option            | Required | Description                        |
| ----------------- | -------- | ---------------------------------- |
| `merchantCode`    | yes      | eSewa product code                 |
| `secret`          | yes      | eSewa signing secret               |
| `environment`     | yes      | `'sandbox'` or `'production'`      |
| `successUrl`      | no\*     | Fallback for `order.returnUrl`     |
| `failureUrl`      | no\*     | Fallback for `order.failureUrl`    |
| `checkoutFormUrl` | no       | Override the form endpoint         |
| `statusCheckUrl`  | no       | Override the status endpoint       |
| `timeoutMs`       | no       | Status API timeout (default 10000) |
| `fetch`           | no       | Custom `fetch` for tests/proxies   |

\* A success and failure URL are required, from config or the order.

Optional surcharges are **subtracted** from the order amount to form `amount`,
while `total_amount` stays the full order amount:

```ts
await gateway.createCheckout(order, {
  surcharges: { tax: '13.00', serviceCharge: '5.00' },
})
```

`verify()` checks, in order: gateway tag → HMAC signature over
`signed_field_names` → amount vs `expected.amount` → `transaction_uuid` vs
`expected.id` → `product_code` vs `merchantCode` → for `COMPLETE`, the status API
must agree and `ref_id` must match `transaction_code`.

| eSewa raw                      | Unified     |
| ------------------------------ | ----------- |
| `COMPLETE`                     | `completed` |
| `PENDING`                      | `pending`   |
| `CANCELED`                     | `canceled`  |
| `NOT_FOUND`                    | `unknown`   |
| `FULL_REFUND`/`PARTIAL_REFUND` | `unknown`   |

### Khalti

REST-redirect integration for Khalti ePayment. Khalti requires a **server-side
lookup** to confirm every payment; the redirect query string is never trusted.
Checkout type: `redirect`.

```ts
import { createKhalti } from '@nepal-payments/khalti'

const gateway = createKhalti({
  secretKey: process.env.KHALTI_SECRET_KEY!,
  environment: 'sandbox',
  returnUrl: 'https://example.com/payments/callback',
  websiteUrl: 'https://example.com',
})
```

| Option        | Required | Description                         |
| ------------- | -------- | ----------------------------------- |
| `secretKey`   | yes      | Khalti secret key (`Authorization`) |
| `environment` | yes      | `'sandbox'` or `'production'`       |
| `returnUrl`   | no\*     | Fallback for `order.returnUrl`      |
| `websiteUrl`  | no       | Defaults to the return URL's origin |
| `initiateUrl` | no       | Override the initiate endpoint      |
| `lookupUrl`   | no       | Override the lookup endpoint        |
| `timeoutMs`   | no       | HTTP timeout (default 10000)        |
| `fetch`       | no       | Custom `fetch` for tests/proxies    |

\* A return URL is required, from config or the order.

Khalti requires at least **Rs. 10** (1000 paisa) and at most 2 decimal places.
`purchase_order_name` falls back to `order.productName`, then
`order.description`, then `order.id`. `customer_info` is built from the order's
customer fields.

`verify()` checks the gateway tag, a well-formed `pidx`, the amount and
`purchase_order_id` against `expected`, and then the **Khalti lookup API**. The
sealed `txnRef.id` is the `pidx`.

| Khalti raw      | Unified     |
| --------------- | ----------- |
| `Completed`     | `completed` |
| `Pending`       | `pending`   |
| `Initiated`     | `pending`   |
| `User canceled` | `canceled`  |
| `Expired`       | `expired`   |
| `Refunded`      | `unknown`   |

### connectIPS

Form-POST integration for the NCHL connectIPS merchant gateway. The callback
carries **only `TXNID`**, so `verify()` always calls the server-to-server
`validatetxn` API to establish authenticity and amount. Checkout type:
`form_post`.

NCHL provides an RSA credential as a PKCS#12 archive. WebCrypto cannot read it,
so convert it once to PKCS#8 (Node-only, behind the
`@nepal-payments/connectips/pfx` subpath so browser bundles never pull in
`node-forge`):

```bash
npay connectips import-pfx ./CREDITOR.pfx --out ./creditor.key
# password is read from NPAY_PFX_PASSWORD or --password-stdin, never argv
```

```ts
import { createConnectIps } from '@nepal-payments/connectips'

const gateway = createConnectIps({
  merchantId: process.env.CONNECTIPS_MERCHANT_ID!,
  appId: process.env.CONNECTIPS_APP_ID!,
  appName: process.env.CONNECTIPS_APP_NAME!,
  password: process.env.CONNECTIPS_PASSWORD!,
  privateKey: process.env.CONNECTIPS_PRIVATE_KEY_PEM!, // PKCS#8
  environment: 'sandbox',
  remarks: 'Order payment', // optional default REMARKS (<= 50 chars)
  particulars: 'Order payment', // optional default PARTICULARS (<= 100 chars)
})
```

| Option          | Required | Description                            |
| --------------- | -------- | -------------------------------------- |
| `merchantId`    | yes      | NCHL merchant id (`MERCHANTID`)        |
| `appId`         | yes      | NCHL app id; Basic-auth user name      |
| `appName`       | yes      | Application name (`APPNAME`)           |
| `password`      | yes      | Basic-auth password for the server API |
| `privateKey`    | yes      | PKCS#8 RSA private key PEM             |
| `environment`   | yes      | `'sandbox'` or `'production'`          |
| `remarks`       | no       | Default `REMARKS` (<= 50 chars)        |
| `particulars`   | no       | Default `PARTICULARS` (<= 100 chars)   |
| `baseUrl`       | no       | Override the environment base URL      |
| `loginUrl`      | no       | Override the login-page endpoint       |
| `validationUrl` | no       | Override the `validatetxn` endpoint    |
| `txnDetailUrl`  | no       | Override the `gettxndetail` endpoint   |
| `timeoutMs`     | no       | Server API timeout (default 10000)     |
| `now`           | no       | Clock override (testing)               |
| `fetch`         | no       | Custom `fetch` for tests/proxies       |

`verify()` checks the gateway tag, that `TXNID` is present, well-formed, and
equals `expected.id`, and that the `validatetxn` response is for this
transaction; for `SUCCESS` it also checks the returned amount. The API response
is the source of truth — the callback carries no status.

| connectIPS raw                                | Unified     |
| --------------------------------------------- | ----------- |
| `SUCCESS` (credit `000`/`999`/`DEFER`/absent) | `completed` |
| `SUCCESS` with a non-settling `creditStatus`  | `failed`    |
| `FAILED`                                      | `failed`    |
| `ERROR` / anything unknown                    | `unknown`   |

### Fonepay

GET-redirect integration for the Fonepay merchant gateway. The callback carries a
signed `DV`, so `verify()` authenticates it locally and (by default) confirms a
completed payment server-side. Checkout type: `redirect`.

```ts
import { createFonepay } from '@nepal-payments/fonepay'

const gateway = createFonepay({
  merchantCode: process.env.FONEPAY_PID!,
  secretKey: process.env.FONEPAY_SECRET_KEY!,
  environment: 'sandbox',
  returnUrl: 'https://shop.example/payments/fonepay/return',
  remarks1: 'Order payment', // optional default R1
  remarks2: 'N/A', // optional default R2
})
```

| Option                | Required | Description                                          |
| --------------------- | -------- | ---------------------------------------------------- |
| `merchantCode`        | yes      | Fonepay merchant code (`PID`)                        |
| `secretKey`           | yes      | Shared HMAC-SHA512 secret for the DV                 |
| `environment`         | yes      | `'sandbox'` or `'production'`                        |
| `returnUrl`           | no       | Fallback `RU`                                        |
| `remarks1`/`remarks2` | no       | Fallback `R1` / `R2` (default `R2` is `N/A`)         |
| `serverVerification`  | no       | Call `verificationMerchant` on verify (default true) |
| `requestUrl`          | no       | Override the initiation endpoint                     |
| `verificationUrl`     | no       | Override the `verificationMerchant` endpoint         |
| `timeoutMs`           | no       | Server API timeout (default 10000)                   |
| `now`                 | no       | Clock override (testing)                             |
| `fetch`               | no       | Custom `fetch` for tests/proxies                     |

`verify()` checks the gateway tag, that `PRN` and `DV` are present, that the
response `DV` matches a locally recomputed HMAC-SHA512 (constant time), that
`PID` and `PRN` match, and — for a completed callback — that `P_AMT` equals
`expected.amount`. When `serverVerification` is enabled, a completed claim is
confirmed against `verificationMerchant`. Set `serverVerification: false` for a
DV-only integration. `status()` requires `expected` because Fonepay's lookup
needs the amount.

| Fonepay                                              | Unified     |
| ---------------------------------------------------- | ----------- |
| `RC=successful` (`PS≠false`)                         | `completed` |
| `RC=failed` / `PS=false`                             | `failed`    |
| `RC=cancel`                                          | `canceled`  |
| `verificationMerchant` reports failure after success | `failed`    |
| anything unknown                                     | `unknown`   |

### Mock

`@nepal-payments/mock` is a fully in-memory `GatewayAdapter` with deterministic
controls — run the whole lifecycle with no credentials.

```ts
import { createMockGateway } from '@nepal-payments/mock'

const gateway = createMockGateway({ secretKey: 'dev-secret' })
const order = createOrder({ id: 'ORDER-1', amount: moneyFromDecimal('100.00') })

const { txnRef } = await gateway.createCheckout(order)
await gateway.pay(txnRef) // simulate the payer
const raw = await gateway.generateCallback(txnRef)
const payment = await gateway.verify(gateway.parseCallback(raw), {
  expected: order,
})
```

| Scenario            | `pay()` result → verify status | Notes                                     |
| ------------------- | ------------------------------ | ----------------------------------------- |
| `success`           | `completed`                    | Default happy path                        |
| `pending`           | `pending`                      | Advance later with `settle()`             |
| `failed`            | `failed`                       | Bank/payment failure                      |
| `expired`           | `expired`                      | Checkout starts and stays expired         |
| `abandoned`         | `initiated` → no callback      | Never paid; `generateCallback` throws     |
| `delayed`           | `completed`                    | `generateCallback` waits `delayMs`        |
| `duplicate`         | `completed`                    | Emit the callback more than once          |
| `timeout`           | throws `AbortError`            | `verify`/`status` abort after `timeoutMs` |
| `invalid-signature` | callback signature is forged   | `verify` throws `SIGNATURE_MISMATCH`      |

Configuration: `secretKey` (required), `scenario`, `checkoutUrl`, `delayMs`,
`timeoutMs`. Controls: `pay`, `settle`, `expire`, `setStatus`,
`generateCallback`, plus the raw `ledger`.

## CLI

Install with `pnpm add -D @nepal-payments/cli` (or run it from the workspace with
`pnpm --filter @nepal-payments/cli exec npay`).

```bash
npay init                       # write a .env.example for the gateways you use
npay init --gateways esewa
npay gateway test mock          # run an offline lifecycle smoke test
npay gateway test esewa         # build a real adapter from env vars (no network)
npay fixtures validate          # parse and check the bundled JSON vectors
npay connectips import-pfx ./CREDITOR.pfx --out ./creditor.key
```

`npay init` writes **placeholders only** — it never invents or stores secrets,
and leaves existing files alone unless `--force` is passed.

## Testing

Use the mock gateway for unit/integration tests, inject `fetch` to test real
adapters off the network, and assert on the unified `status` and the
`NepalPaymentsError.code`.

```bash
pnpm test            # vitest: unit, gateway, conformance, framework, packaging
pnpm test:watch
pnpm test:coverage
pnpm test:bun        # run the Bun runtime example test
```

The repo also ships a **conformance suite** (`tests/conformance`) run against
every gateway through thin drivers, and language-agnostic **JSON vectors**
(`tests/vectors`) covering amounts, callbacks, signatures, and status mappings.

To test a gateway without the network, inject `fetch`:

```ts
const gateway = createKhalti({
  secretKey: 'sandbox-secret',
  environment: 'sandbox',
  returnUrl: 'https://example.com/callback',
  fetch: async () =>
    new Response(
      JSON.stringify({ pidx: 'pidx-1', payment_url: 'https://pay/x' }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ),
})
```

Guidelines:

- Never call a real gateway in unit tests — inject `fetch` or use the mock.
- Cover failure paths (tampered signature, amount/order mismatch, unknown
  transaction, timeout); they are the security surface.
- Keep fixtures deterministic; freeze time or inject ids where needed.

## Security

- **Callbacks are untrusted.** `parseCallback()` only decodes and tags; never
  read `callback.data` for business decisions.
- **Only `verify()` creates a `VerifiedPayment`.** Nothing else in the SDK
  produces one.
- **Verify gateway, order, amount, and signature** — server side, in constant
  time. Never trust a client redirect alone.
- **Server-side confirmation.** Signature checks alone are not always enough:
  eSewa's status API, Khalti's lookup, connectIPS `validatetxn`, and Fonepay's
  `serverVerification` confirm the payment before sealing.
- **The seal is a type/accident barrier, not a cryptographic proof.** It is lost
  through JSON round-trips; re-verify before acting on persisted data.
- **Secrets never leave your server** and are never logged.
- **Idempotency.** Callbacks can repeat; guard fulfillment on a unique order id
  at the database level.
- **Environment and credentials must match.** Sandbox and production secrets
  differ; overriding endpoints must be consistent with the credentials.
- **Replay bookkeeping.** Record `callbackFingerprint()` per handled callback and
  refuse duplicates.

`payment.raw` is safe to log and helps diagnose disagreements, but it is a frozen
clone.

## Errors

Every error extends `NepalPaymentsError` with a machine-readable `code`. Branch
on `error.code`, not the message.

```ts
import { NepalPaymentsError } from '@nepal-payments/core'

try {
  const payment = await gateway.verify(callback, { expected: order })
} catch (error) {
  if (error instanceof NepalPaymentsError) {
    console.error(error.name, error.code, error.message)
  }
}
```

| Class                | Used for                                              |
| -------------------- | ----------------------------------------------------- |
| `NepalPaymentsError` | Base class; catch this to catch anything from the SDK |
| `PaymentError`       | Invalid input, malformed callbacks, unsupported ops   |
| `VerificationError`  | A callback/status failed a security check             |
| `ConfigurationError` | Bad gateway configuration                             |
| `MoneyError`         | Invalid money construction or arithmetic              |

Common codes:

| Code                      | Meaning                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `INVALID_ORDER`           | Malformed order (e.g. non-string metadata value)              |
| `INVALID_ORDER_ID`        | Order id missing, empty, too long, or contains bad characters |
| `INVALID_AMOUNT`          | Amount invalid, zero/negative, or unsupported                 |
| `UNSAFE_AMOUNT`           | Amount exceeds `Number.MAX_SAFE_INTEGER` minor units          |
| `INVALID_URL`             | A return/success/failure/website URL is invalid               |
| `INVALID_STATUS`          | Unknown status value or failed status transition              |
| `INVALID_TXN_REF`         | Transaction reference id/shape is invalid                     |
| `INVALID_BASE64`          | Base64 payload could not be decoded                           |
| `INVALID_MONEY`           | Not a valid `Money` value                                     |
| `INVALID_CURRENCY`        | Currency other than the supported `'NPR'`                     |
| `INVALID_PRECISION`       | Precision outside the supported range                         |
| `INVALID_DECIMAL`         | Decimal string could not be parsed exactly                    |
| `CURRENCY_MISMATCH`       | Combining money of different currencies                       |
| `PRECISION_MISMATCH`      | Combining money of different precision                        |
| `MALFORMED_CALLBACK`      | Callback payload missing/undecodable/not JSON                 |
| `GATEWAY_MISMATCH`        | Callback verified with the wrong gateway adapter              |
| `SIGNATURE_MISMATCH`      | Signature missing or wrong (or secret mismatch)               |
| `AMOUNT_MISMATCH`         | Callback amount does not match the expected order amount      |
| `ORDER_MISMATCH`          | Callback order id/product code does not match expected order  |
| `UNKNOWN_TRANSACTION`     | Gateway has no such transaction (or status disagrees)         |
| `UNVERIFIED_PAYMENT`      | Tried to persist a payment that `verify()` did not seal       |
| `INVALID_IDEMPOTENCY_KEY` | Idempotency key is empty or not a string                      |

`verify()` may also throw a `VerificationError` without a code for transport
failures (e.g. malformed JSON from a status lookup); handle a missing `code`
defensively. Map `NepalPaymentsError` to HTTP 400 (bad/untrusted input) and
unexpected errors to 500.

## Architecture

- **Stateless by default** — no sessions, no database, no hidden state. You
  persist the order and the `txnRef.id → order.id` mapping.
- **No framework lock-in** — pure functions and plain objects. `core` depends on
  no framework; example apps show Express, Hono, and Next.js.
- **No floating point money** — `bigint` minor units.
- **No gateway-specific logic in core** — each gateway implements the contract
  in its own package.
- **Verify before trust** — only `verify()` produces a `VerifiedPayment`.

```
packages/
├── core/        types, Money, Order, errors, crypto, GatewayAdapter,
│                reconcile(), PaymentStore
├── esewa/       eSewa ePay V2 (form POST)
├── khalti/      Khalti ePayment (REST redirect)
├── connectips/  connectIPS (form POST + server validation)
├── fonepay/     Fonepay (GET redirect + HMAC-SHA512 DV)
├── mock/        in-memory gateway for tests
└── cli/         the `npay` CLI
apps/
├── express-example/
├── hono-example/
└── next-example/
```

Adding a gateway: implement `GatewayAdapter` with `core` types, add its method
to `PAYMENT_METHODS`, add fixtures and a conformance driver, and extend this
README with its configuration and status mapping.

## Development

```bash
pnpm install
pnpm build          # build all packages
pnpm test           # vitest (unit, gateway, conformance, framework, packaging)
pnpm test:bun       # run the Bun runtime example test
pnpm lint
pnpm typecheck
pnpm format:check   # verify formatting
pnpm format         # apply Prettier
```

This is a pnpm workspace with TypeScript strict mode, Vitest, ESLint, and
Prettier. Every feature needs tests and every gateway needs fixtures.

## Examples

Runnable apps in [`apps/`](apps) demonstrate the recommended server wiring:

- [`apps/express-example`](apps/express-example)
- [`apps/hono-example`](apps/hono-example)
- [`apps/next-example`](apps/next-example)

Each app is also exercised by the framework tests against the mock gateway.

## License

MIT
