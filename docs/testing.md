# Testing

The SDK is designed to be tested without touching a real gateway. Use
`@nepal-payments/mock` for unit and integration tests, the shared conformance
suite to prove a gateway honors the contract, and the JSON vectors for
data-level assertions.

## Commands

```bash
pnpm test          # vitest: unit, gateway, conformance, framework
pnpm test:watch
pnpm test:coverage
pnpm test:bun      # runs the Hono example on the Bun runtime
```

## The mock gateway

`@nepal-payments/mock` is a fully in-memory `GatewayAdapter` with deterministic
controls. It supports the same lifecycle (`createCheckout`, `parseCallback`,
`verify`, `status`) plus helpers to simulate the customer and the gateway.

```ts
import { createMockGateway } from '@nepal-payments/mock'
import { createOrder, moneyFromDecimal } from '@nepal-payments/core'

const gateway = createMockGateway({ secretKey: 'test-secret' })

const order = createOrder({ id: 'ORDER-1', amount: moneyFromDecimal('100.00') })
const { checkout, txnRef } = await gateway.createCheckout(order)

await gateway.pay(txnRef) // customer completes payment
const raw = await gateway.generateCallback(txnRef) // gateway emits callback

const callback = gateway.parseCallback({ query: raw.query })
const payment = await gateway.verify(callback, { expected: order })
// payment.status === 'completed'
```

### Configuration

```ts
createMockGateway({
  secretKey: 'test-secret', // required, HMAC key for callbacks
  scenario: 'success', // default 'success'
  checkoutUrl: 'https://mock.invalid/pay', // URL prefix for checkout
  delayMs: 0, // artificial delay for the 'delayed' scenario
  timeoutMs: 10_000, // abort budget
})
```

### Scenarios

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

### Controls

```ts
await gateway.pay(txnRef) // simulate a completed/pending/failed payment
await gateway.settle(txnRef) // pending → completed
await gateway.expire(txnRef) // initiated|pending → expired
await gateway.setStatus(txnRef, 'canceled') // force any ledger state
await gateway.generateCallback(txnRef) // emit the signed callback
```

`MockGateway` also exposes `parseCallback`, `verify`, `status`, and the raw
`ledger` for assertions.

### Callback format

The mock callback is `?data=<base64 JSON>` where the JSON is
`{ txn_id, order_id, amount, status, signature }` and `signature` is an
HMAC-SHA256 over `txn_id=…,order_id=…,amount=…,status=…` using `secretKey`.
Helpers are exported for building forged/tampered cases:

```ts
import { signMockCallback, safeBase64Encode } from '@nepal-payments/mock'
```

## Conformance suite

`tests/conformance` runs one behavioral suite against every gateway through a
thin driver, guaranteeing they all behave consistently.

- `tests/conformance/driver.ts` — the driver contract (a `GatewayAdapter` plus
  hooks to inject upstream disagreements and tampered signatures).
- `tests/conformance/suite.ts` — the shared tests.
- `tests/conformance/drivers/*.driver.ts` — per-gateway drivers.
- `tests/conformance/*.conformance.test.ts` — one run per gateway.

When you add a gateway, add a driver and run the shared suite against it. Every
adapter must pass the same checks for checkout shape, txn ids, verify
sealing/rejection, status lookup, and callback parsing.

### Testing a gateway off the network

Every gateway accepts a `fetch` option. Inject a stub instead of hitting the
network:

```ts
const gateway = createKhalti({
  secretKey: 'sandbox-secret',
  environment: 'sandbox',
  returnUrl: 'https://example.com/callback',
  fetch: async () =>
    new Response(
      JSON.stringify({ pidx: 'pidx-1', payment_url: 'https://pay/x' }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    ),
})
```

## JSON test vectors

`tests/vectors/` holds language-agnostic fixtures with expected outputs, used by
`tests/vectors/vectors.test.ts` and reusable by other implementations:

- `amounts/` — money parsing, boundaries, precision scaling, invalid inputs
- `callbacks/` — gateway callback payloads
- `signatures/` — signing schemes and known signatures
- `statuses/` — raw → unified status mappings

See [`tests/vectors/README.md`](../tests/vectors/README.md).

## Framework examples

The three apps double as integration tests of the recommended server wiring:

| App                    | Test                                                |
| ---------------------- | --------------------------------------------------- |
| `apps/express-example` | `tests/framework/express.test.ts` (`supertest`)     |
| `apps/hono-example`    | `tests/framework/hono.test.ts` + `hono.bun.test.ts` |
| `apps/next-example`    | `tests/framework/next.test.ts` (route handlers)     |

Each test drives the full flow (checkout → pay → callback → verify → idempotent
fulfill) against the mock gateway.

## Guidelines

- Never call a real gateway in unit tests — inject `fetch` or use the mock.
- Always assert on the unified `status` and the `NepalPaymentsError.code`.
- Cover the failure paths (tampered signature, amount/order mismatch, unknown
  transaction, timeout) — they are the security surface.
- Keep fixtures deterministic; freeze time or inject ids where needed.
