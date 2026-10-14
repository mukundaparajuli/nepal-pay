# Nepal Payments

A stateless, framework-agnostic TypeScript SDK for Nepali payment gateways
(eSewa, Khalti, ConnectIPS, and Fonepay).

- Money is exact (bigint minor units), never floating point.
- Callbacks are untrusted; only `verify()` produces a sealed `VerifiedPayment`.
- No framework, database, or session dependency — hand it an `Order`, render the
  checkout, and verify the callback on your server.

## Packages

| Package                      | Purpose                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `@nepal-payments/core`       | Types, `Money`, `Order`, errors, gateway contract, `reconcile()`, `PaymentStore` |
| `@nepal-payments/esewa`      | eSewa ePay V2 (form POST)                                                        |
| `@nepal-payments/khalti`     | Khalti ePayment (REST redirect)                                                  |
| `@nepal-payments/connectips` | NCHL connectIPS (form POST + server-side validation)                             |
| `@nepal-payments/fonepay`    | Fonepay (GET redirect + HMAC-SHA512 DV)                                          |
| `@nepal-payments/mock`       | In-memory gateway for tests and local development                                |

## Quickstart (five minutes)

### 1. Install

```bash
pnpm add @nepal-payments/core @nepal-payments/esewa
```

### 2. Create a gateway

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

### 3. Create an order

Amounts are exact decimal strings — use `moneyFromDecimal`, never a float.

```ts
import { createOrder, moneyFromDecimal } from '@nepal-payments/core'

const order = createOrder({
  id: 'ORDER-1001', // 1–100 chars, alphanumeric / hyphens
  amount: moneyFromDecimal('100.00'),
})
```

### 4. Create the checkout

```ts
const { checkout, txnRef } = await gateway.createCheckout(order)
// checkout.type === 'form_post' for eSewa
// checkout.url        -> eSewa endpoint
// checkout.formParams -> hidden form fields (incl. signature)
```

### 5. Redirect / render the form

eSewa uses a `form_post` checkout. Render the returned fields as a hidden form
and submit it to the gateway:

```ts
// server-rendered (Express/Next/Hono) — keep the secret server-side only
res.send(`
  <form id="pay" method="POST" action="${checkout.url}">
    ${Object.entries(checkout.formParams)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}">`)
      .join('')}
  </form>
  <script>document.getElementById('pay').submit()</script>
`)
```

Khalti uses a `redirect` checkout: send the browser to `checkout.url`.

```ts
if (checkout.type === 'redirect') res.redirect(checkout.url)
```

### 6. Handle the callback

The customer returns to your `successUrl` (or the gateway calls your callback
URL). Treat everything as untrusted input.

```ts
// GET /payments/callback?data=<base64>
const callback = gateway.parseCallback({ query: req.query })
```

### 7. Verify (server-side, always)

`verify()` re-checks the gateway tag, order, amount, and signature, and (for
eSewa) confirms against the status API before sealing the result.

```ts
const payment = await gateway.verify(callback, { expected: order })

// payment is a frozen VerifiedPayment
payment.orderId // 'ORDER-1001'
payment.amount // Money
payment.status // 'completed' | 'pending' | 'failed' | ...
payment.txnRef // { id, gateway }
```

### 8. Fulfill

Fulfill only on a sealed `completed` payment, and guard against duplicate
callbacks by order id.

```ts
if (payment.status === 'completed' && !alreadyFulfilled(payment.orderId)) {
  await markOrderPaid(payment.orderId, payment.txnRef)
}
```

That is the whole lifecycle:

```
install → create gateway → create order → create checkout
        → redirect/form → callback → verify → fulfill
```

## Try it without real credentials

Use the mock gateway to run the full flow locally.

```ts
import { createMockGateway } from '@nepal-payments/mock'

const gateway = createMockGateway({ secretKey: 'dev-secret' })
const { txnRef } = await gateway.createCheckout(order)
await gateway.pay(txnRef) // simulate the payer
const raw = await gateway.generateCallback(txnRef)
const payment = await gateway.verify(gateway.parseCallback(raw), {
  expected: order,
})
```

See the runnable examples in [`apps/`](apps): Express, Hono, and Next.js.

## Reconcile a missing callback

Callbacks can be lost or delayed. Ask the gateway what happened instead:

```ts
import { reconcile } from '@nepal-payments/core'

const result = await reconcile(
  gateway,
  { order, txnRef },
  {
    maxAttempts: 5,
    backoffMs: 250,
    timeoutMs: 10_000,
  }
)

result.resolved // true once completed/failed/canceled/expired
result.status // 'pending' | 'unknown' | terminal
```

`reconcile()` retries while a payment is non-terminal and stops on a terminal
status, timeout, expiry, or attempt limit. It performs one bounded run and
**does not schedule itself** — drive it from your own queue or cron. See
[reconciliation.md](docs/reconciliation.md).

## Optional persistence

The SDK ships no database. Persist payments and idempotency keys by
implementing the `PaymentStore` interface (an in-memory version is included for
tests). See [persistence.md](docs/persistence.md) for Postgres and Redis
examples.

## Development

```bash
pnpm install
pnpm build        # build all packages
pnpm test         # vitest (unit, gateway, conformance, framework)
pnpm test:bun     # Bun runtime example test
pnpm lint
pnpm typecheck
```

## Documentation

- [Getting started](docs/getting-started.md) — concepts and the full flow
- [eSewa](docs/esewa.md) · [Khalti](docs/khalti.md) · [connectIPS](docs/connectips.md) · [Fonepay](docs/fonepay.md)
- [Reconciliation](docs/reconciliation.md) — polling status for missing callbacks
- [Persistence](docs/persistence.md) — the optional `PaymentStore`
- [Testing](./docs/testing.md) — the mock gateway, conformance suite, vectors
- [Errors](./docs/errors.md) and [Troubleshooting](docs/troubleshooting.md)
- [Security](docs/security.md) · [Architecture](docs/architecture.md)

## License

MIT
