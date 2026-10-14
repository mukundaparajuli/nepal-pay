# Architecture

## Principles

- **Stateless by default** — no sessions, no database, no hidden state. The SDK
  turns an `Order` into a checkout, and turns an untrusted callback into a
  sealed `VerifiedPayment`.
- **No framework lock-in** — pure functions and plain objects. The example apps
  show Express, Hono, and Next.js, but core depends on none of them.
- **No floating point money** — amounts are `bigint` minor units.
- **No gateway-specific logic in core** — the contract lives in
  `@nepal-payments/core`; each gateway implements it in its own package.
- **Verify before trust** — only `verify()` produces a `VerifiedPayment`.

## Packages

```
packages/
├── core/        types, Money, Order, errors, crypto utils, GatewayAdapter,
│                reconcile() helper, PaymentStore contract
├── esewa/       eSewa ePay V2 (form POST) implementation
├── khalti/      Khalti ePayment (REST redirect) implementation
├── connectips/  NCHL connectIPS (form POST + server-side validation)
├── fonepay/     Fonepay (GET redirect + HMAC-SHA512 DV)
├── mock/        in-memory gateway for tests and local development
└── cli/         the `npay` command-line tool
apps/
├── express-example/
├── hono-example/
└── next-example/
```

`core` has no external runtime dependencies. Every gateway depends on `core`
only, except `connectips`, which also uses `node-forge` to parse PKCS#12
(`.pfx`) key files. The `cli` package wires the gateways together. Apps depend
on `core` plus one gateway (the examples use `mock`).

## The gateway contract

Every gateway is a `GatewayAdapter`:

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

See [gateway-contract.md](./gateway-contract.md) for the full, shipped surface.

### Data flow

```
                 createCheckout(order)
Order ─────────────────────────────────►  Checkout + TxnRef
                                              │  (render form / redirect)
                                              ▼
RawCallbackRequest ──parseCallback──► UnverifiedCallback
                                              │
                                     verify({ expected: order })
                                              ▼
                                       VerifiedPayment
```

The dashed, untrusted half is clearly separated: `parseCallback` only decodes
and tags; `verify` is the only door to trust.

## Money

Money is an exact integer count of the minor unit, never a float:

```ts
interface Money {
  readonly amount: bigint // scaled minor units: 100.00 NPR => 10000n
  readonly currency: 'NPR'
  readonly precision: number // decimal places, e.g. 2
}
```

Construct with `moneyFromDecimal('100.00')` (decimal string) or
`createMoney(10000n)` (minor units). Arithmetic (`addMoney`, `subtractMoney`,
`multiplyMoney`) requires matching currency and precision; comparisons
(`moneyEquals`, `compareMoney`) are cross-precision and same-currency. Serialize
exactly with `moneyToJSON` / `moneyFromJSON`.

## Order, Checkout, and TxnRef

- `createOrder` validates an `Order` (id, positive amount, URLs, metadata) and
  freezes it. Wrap untrusted input before checkout.
- `Checkout` is either a `redirect` (`url`) or a `form_post` (`url` +
  `formParams`). Gateways that sign a form return `form_post`.
- `TxnRef` is `{ id, gateway }` and is the correlation key returned by
  `createCheckout`. Persist `txnRef.id → order.id`.

## Callbacks and verification

`RawCallbackRequest` (query/body/headers) and `UnverifiedCallback` are untrusted
data. `verify()` re-checks the gateway tag, the expected order, the amount, and
the signature (constant time), and for some gateways performs a **server-side
status confirmation**:

| Gateway    | Extra check inside `verify()`                                           |
| ---------- | ----------------------------------------------------------------------- |
| eSewa      | On `COMPLETE`, the status API must agree and `ref_id` must match        |
| Khalti     | The lookup API must report the payment as successful                    |
| connectIPS | The transaction-detail API must agree with the callback                 |
| Fonepay    | The response DV is recomputed and compared (HMAC-SHA512, constant time) |
| Mock       | Ledger signature + amount + order                                       |

See [security.md](./security.md) for the trust model and [errors.md](./errors.md)
for the failure codes.

## Status

All gateways map their raw states onto one set:

```
'pending' | 'completed' | 'failed' | 'canceled' | 'expired' | 'unknown'
```

`status()` can be called with a `TxnRef` (and, optionally, `expected`) for
reconciliation when a callback is missing or delayed.

## Reconciliation

Callbacks can be lost or delayed, so `core` ships a bounded `reconcile()` helper
on top of `status()`:

```
pending payment → status lookup → retry/backoff → final state
```

`reconcile(gateway, { order, txnRef }, options)` polls `status()`, retrying
while the payment is non-terminal (`pending`/`unknown`) with exponential
backoff, and stops on a terminal status (`completed`/`failed`/`canceled`/
`expired`), on `timeoutMs`, on `expiresAt`, or when `maxAttempts` is reached.
It **does not schedule itself** — run it from your own cron/queue. Scheduling
stays outside the library. See [reconciliation.md](./reconciliation.md).

## Optional persistence

`core` defines a `PaymentStore` interface (`getPayment`, `savePayment`,
`acquireIdempotencyKey`) and an in-memory implementation for tests. It does not
depend on a database; you implement the interface against your own store. The
interface exists so reconciliation and idempotent fulfillment have a home, not
because the SDK requires persistence. See [persistence.md](./persistence.md).

## Extensibility

Adding a gateway means:

1. implement `GatewayAdapter` using `core` types;
2. add its method name to `PAYMENT_METHODS` in core;
3. add fixtures and a driver so it runs under the shared conformance suite;
4. document it under `docs/`.

`eSewa`, `Khalti`, `connectIPS`, `Fonepay`, and `mock` are all implemented; their
protocol research notes live in [`docs/research/`](./research/).

## Testing architecture

- `@nepal-payments/mock` backs integration tests and local development.
- The **conformance suite** (`tests/conformance`) runs one behavioral suite
  against every gateway via thin drivers.
- **JSON vectors** (`tests/vectors`) provide language-agnostic fixtures with
  expected outputs.
- **Framework tests** (`tests/framework`) exercise the example apps.

See [testing.md](./testing.md).

## See also

- [Gateway contract](./gateway-contract.md)
- [Security](./security.md)
- [Getting started](./getting-started.md)
