# Gateway Contract

This document describes the public contract shipped by `@nepal-payments/core`
as implemented. Implementation and tests are the source of truth; update this
document when the shipped API changes.

## Money

Money is an integer count of the minor unit (never floats):

```ts
export type Currency = 'NPR'

export interface Money {
  readonly amount: bigint // scaled minor units, e.g. 100.00 NPR => 10000n
  readonly currency: Currency
  readonly precision: number // decimal places, e.g. 2
}
```

Constructors:

- `createMoney(amount: bigint | number | string, currency?, precision?)` — scaled
  integer input. Number amounts must be safe integers; use string/bigint for
  larger values.
- `moneyFromDecimal(decimal: string, currency?, precision?)` — decimal string
  input, e.g. `'100.50'`.
- `isMoney(value): value is Money` — runtime guard.
- `moneyToDecimal(money): string` — serializes to a decimal string.
- `moneyToJSON(money) / moneyFromJSON(json)` — exact portable representation
  (`{ amount: "10000", currency: "NPR", precision: 2 }`).
- Arithmetic (same currency + same precision required): `addMoney`, `subtractMoney`,
  `multiplyMoney`.
- `compareMoney(a, b)` and `moneyEquals(a, b)` — cross-precision, same currency.
  `compareMoney` throws on currency mismatch; `moneyEquals` returns `false`.

## Order

```ts
export interface Order {
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
```

`createOrder(input: Order): Order` validates the id (1–100 chars), enforces a
positive amount, parses URLs (`http:`/`https:`), and returns a frozen copy. Use
it instead of raw object literals when the input is untrusted.

## Checkout

```ts
export type Checkout =
  | {
      readonly type: 'redirect'
      readonly url: string
      readonly headers?: Record<string, string>
    }
  | {
      readonly type: 'form_post'
      readonly url: string
      readonly formParams: Record<string, string> // required
      readonly headers?: Record<string, string>
    }
```

## TxnRef

```ts
export interface TxnRef {
  readonly id: string
  readonly gateway: PaymentMethod
}
```

## PaymentMethod and PaymentStatus

```ts
export type PaymentMethod =
  'esewa' | 'khalti' | 'connectips' | 'fonepay' | 'mock'
export const PAYMENT_METHODS: readonly PaymentMethod[]

export type PaymentStatus =
  'pending' | 'completed' | 'failed' | 'canceled' | 'expired' | 'unknown'
export const PAYMENT_STATUSES: readonly PaymentStatus[]

export function isPaymentStatus(value: unknown): value is PaymentStatus
```

## Callbacks

```ts
export interface RawCallbackRequest {
  readonly body?: unknown
  readonly query?: Record<string, unknown>
  readonly headers?: Record<string, string>
}

export interface UnverifiedCallback {
  readonly gateway: PaymentMethod
  readonly data: Record<string, unknown>
  readonly headers?: Record<string, string>
  readonly body?: unknown // raw body preserved for signature verification
}
```

`callbackFingerprint(callback): Promise<string>` — stable, key-order-independent
SHA-256 digest of the callback content. Usable for replay bookkeeping.

## VerifiedPayment

Created only by `verify()` (via the package-internal factory):

```ts
export interface VerifiedPayment {
  readonly [seal]: true // private brand, not assignable from plain objects
  readonly orderId: string
  readonly amount: Money
  readonly status: PaymentStatus
  readonly txnRef: TxnRef
  readonly verifiedAt: Date
  readonly raw?: Record<string, unknown>
}
```

- `isVerifiedPayment(value): value is VerifiedPayment` — checks the seal
  descriptor. The seal is a type/accident barrier, not a cryptographic proof.
- Sealed payments are frozen, including `amount`, `txnRef`, `verifiedAt`, and a
  deep-cleaned clone of `raw`. Unknown extra input keys are dropped.
- The seal is lost through JSON serialization and object spread; persist and
  re-verify explicitly.
- The factory and its input type are NOT part of the public surface; import
  them from `@nepal-payments/core/internal` (same package only).

## GatewayAdapter

```ts
export interface GatewayAdapter {
  readonly name: PaymentMethod
  createCheckout(order: Order): Promise<CheckoutResult>
  parseCallback(request: RawCallbackRequest): UnverifiedCallback
  verify(
    callback: UnverifiedCallback,
    options: VerifyOptions
  ): Promise<VerifiedPayment>
  status(txnRef: TxnRef, options?: StatusOptions): Promise<VerifiedPayment>
}

export interface VerifyOptions {
  readonly expected: Order // required: bind verification to the order
  readonly [key: string]: unknown
}

export interface CheckoutResult {
  readonly checkout: Checkout
  readonly txnRef: TxnRef
}
```

The four methods are required on every adapter. `verify()` MUST check the
gateway tag, the order, the amount, and the signature before sealing.

## Reconciliation

`core` adds a bounded helper over `status()`:

```ts
export const TERMINAL_PAYMENT_STATUSES: readonly [
  'completed',
  'failed',
  'canceled',
  'expired',
]

export interface PendingPayment {
  readonly order: Order
  readonly txnRef: TxnRef
}

export interface ReconcileOptions {
  readonly maxAttempts?: number // default 3
  readonly backoffMs?: number // default 250 (exponential)
  readonly maxBackoffMs?: number // default 5000
  readonly timeoutMs?: number // default 10000
  readonly expiresAt?: Date
  readonly now?: () => number
  readonly sleep?: (ms: number) => Promise<void>
  readonly retryOnError?: boolean // default true
}

export interface ReconcileResult {
  readonly payment: VerifiedPayment
  readonly status: PaymentStatus
  readonly attempts: number
  readonly resolved: boolean
  readonly reason: 'terminal' | 'exhausted' | 'timeout' | 'expired'
}

export function isTerminalPaymentStatus(
  value: unknown
): value is TerminalPaymentStatus

export function reconcile(
  gateway: GatewayAdapter,
  payment: PendingPayment,
  options?: ReconcileOptions
): Promise<ReconcileResult>
```

`reconcile()` performs one bounded run; it does not schedule itself. See
[reconciliation.md](./reconciliation.md).

## Persistence

Optional, database-agnostic persistence contract:

```ts
export interface Payment {
  readonly orderId: string
  readonly amount: Money
  readonly status: PaymentStatus
  readonly txnRef: TxnRef
  readonly verifiedAt: Date
  readonly updatedAt: Date
  readonly raw?: Record<string, unknown>
}

export interface PaymentStore {
  getPayment(orderId: string): Promise<Payment | null>
  savePayment(payment: Payment): Promise<void>
  acquireIdempotencyKey(key: string): Promise<boolean>
}

export function paymentFromVerified(
  payment: VerifiedPayment,
  now?: Date
): Payment

export class InMemoryPaymentStore implements PaymentStore
export function createInMemoryPaymentStore(): InMemoryPaymentStore
```

`paymentFromVerified()` rejects unsealed input with `UNVERIFIED_PAYMENT`. The
in-memory store is for tests; implement `PaymentStore` against your own
database. See [persistence.md](./persistence.md).

## Errors

Every gateway error extends `NepalPaymentsError` with an optional machine
readable `code`:

```ts
export class NepalPaymentsError extends Error { code?: PaymentErrorCode; details?: unknown }
export class PaymentError extends NepalPaymentsError
export class VerificationError extends NepalPaymentsError
export class ConfigurationError extends NepalPaymentsError
export class MoneyError extends NepalPaymentsError
```

Codes include `INVALID_ORDER`, `INVALID_AMOUNT`, `GATEWAY_MISMATCH`,
`ORDER_MISMATCH`, `AMOUNT_MISMATCH`, `SIGNATURE_MISMATCH`,
`UNKNOWN_TRANSACTION`, `NOT_IMPLEMENTED`, and others.

## Crypto helpers

All signatures are compared in constant time:

```ts
constantTimeCompare(a: string, b: string): boolean
sha256(data: string): Promise<string>
hmacSha256(data: string, secret: string): Promise<string>
verifySha256(data: string, expectedHash: string): Promise<boolean>
verifyHmacSha256(data: string, secret: string, expectedSignature: string): Promise<boolean>
safeBase64Encode(data: string): string
safeBase64Decode(encoded: string): string // strict, throws INVALID_BASE64
isValidOrderId(orderId: string): boolean // 1..100 chars
```

## Contract Constraints

- Core must remain stateless
- No gateway-specific logic in core
- Callbacks are untrusted — only `verify()` creates `VerifiedPayment`
- Money is integer-based only (bigint), never floats
- All verification must validate gateway, order, amount, and signature
- Constant-time comparison for signatures
- Never log secrets
