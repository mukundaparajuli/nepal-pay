# Persistence (optional)

The SDK is **stateless** and ships no database. Persistence is optional, but two
things usually want it:

- **Reconciliation** needs to know which payments are still pending.
- **Fulfillment** needs idempotency so a repeated callback ships one order.

`@nepal-payments/core` defines a small `PaymentStore` interface and an
in-memory implementation for tests. You implement it against whatever you
already use.

> There are **no** Postgres/Redis packages. The snippets below are examples, not
> shipped code. Keep secrets out of your store and never persist a gateway
> secret.

## The contract

```ts
import type { Money, PaymentStatus, TxnRef } from '@nepal-payments/core'

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
```

- `getPayment(orderId)` — return the stored payment or `null`.
- `savePayment(payment)` — insert or update by `payment.orderId` (upsert).
- `acquireIdempotencyKey(key)` — **atomically** claim a key. Resolve `true` if
  this caller claimed it, `false` if it was already claimed. Must be safe under
  concurrent calls and across processes.

### Building a `Payment` from a sealed result

`paymentFromVerified()` converts a `VerifiedPayment` into a storable `Payment`
and rejects anything that was not produced by `verify()` / `status()`:

```ts
import { paymentFromVerified } from '@nepal-payments/core'

const stored = paymentFromVerified(payment) // payment: VerifiedPayment
await store.savePayment(stored)
```

## In-memory store (tests only)

```ts
import { InMemoryPaymentStore } from '@nepal-payments/core'

const store = new InMemoryPaymentStore()
await store.savePayment(paymentFromVerified(payment))
const found = await store.getPayment(payment.orderId)
```

State is process-local and lost on restart — use it in tests and local
development, not in production. `clear()` resets it between tests.

## Serializing a `Payment`

`Money` holds a `bigint` and timestamps are `Date`, which `JSON.stringify`
cannot round-trip losslessly. Store money as its minor unit (string) and dates
as timestamps or ISO strings:

```ts
import { moneyToJSON } from '@nepal-payments/core'

const row = {
  order_id: stored.orderId,
  txn_id: stored.txnRef.id,
  gateway: stored.txnRef.gateway,
  amount: stored.amount.amount.toString(), // minor units, e.g. '10000'
  currency: stored.amount.currency,
  precision: stored.amount.precision,
  status: stored.status,
  verified_at: stored.verifiedAt.toISOString(),
  updated_at: stored.updatedAt.toISOString(),
}
```

Read back with `createMoney(row.amount, row.currency, row.precision)` and
`new Date(row.verified_at)`.

## Example: Postgres

```ts
import { createMoney } from '@nepal-payments/core'
import type {
  Payment,
  PaymentStatus,
  PaymentStore,
  TxnRef,
} from '@nepal-payments/core'
import type { Pool } from 'pg'

export class PostgresPaymentStore implements PaymentStore {
  constructor(private readonly pool: Pool) {}

  async getPayment(orderId: string): Promise<Payment | null> {
    const { rows } = await this.pool.query(
      `select order_id, txn_id, gateway, amount, currency, precision,
              status, verified_at, updated_at, raw
         from payments where order_id = $1`,
      [orderId]
    )
    const row = rows[0]
    if (row === undefined) return null
    return {
      orderId: row.order_id,
      amount: createMoney(row.amount, row.currency, row.precision),
      status: row.status as PaymentStatus,
      txnRef: { id: row.txn_id, gateway: row.gateway } as TxnRef,
      verifiedAt: new Date(row.verified_at),
      updatedAt: new Date(row.updated_at),
      ...(row.raw !== null ? { raw: row.raw } : {}),
    }
  }

  async savePayment(payment: Payment): Promise<void> {
    await this.pool.query(
      `insert into payments
         (order_id, txn_id, gateway, amount, currency, precision,
          status, verified_at, updated_at, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (order_id) do update set
         txn_id = excluded.txn_id,
         gateway = excluded.gateway,
         amount = excluded.amount,
         status = excluded.status,
         verified_at = excluded.verified_at,
         updated_at = excluded.updated_at,
         raw = excluded.raw`,
      [
        payment.orderId,
        payment.txnRef.id,
        payment.txnRef.gateway,
        payment.amount.amount.toString(),
        payment.amount.currency,
        payment.amount.precision,
        payment.status,
        payment.verifiedAt.toISOString(),
        payment.updatedAt.toISOString(),
        payment.raw ?? null,
      ]
    )
  }

  async acquireIdempotencyKey(key: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `insert into idempotency_keys (key) values ($1)
       on conflict (key) do nothing`,
      [key]
    )
    return rowCount === 1
  }
}
```

The `on conflict do nothing` is what makes the claim atomic: exactly one caller
inserts the row and gets `rowCount === 1`.

## Example: Redis

```ts
import { createMoney } from '@nepal-payments/core'
import type { Payment, PaymentStore } from '@nepal-payments/core'
import type { Redis } from 'ioredis'

export class RedisPaymentStore implements PaymentStore {
  constructor(private readonly redis: Redis) {}

  async getPayment(orderId: string): Promise<Payment | null> {
    const value = await this.redis.get(`payment:${orderId}`)
    if (value === null) return null
    const data = JSON.parse(value) as Record<string, string>
    return {
      orderId: data.orderId,
      amount: createMoney(data.amount, data.currency, Number(data.precision)),
      status: data.status as Payment['status'],
      txnRef: {
        id: data.txnId,
        gateway: data.gateway as Payment['txnRef']['gateway'],
      },
      verifiedAt: new Date(data.verifiedAt),
      updatedAt: new Date(data.updatedAt),
    }
  }

  async savePayment(payment: Payment): Promise<void> {
    await this.redis.set(
      `payment:${payment.orderId}`,
      JSON.stringify({
        orderId: payment.orderId,
        txnId: payment.txnRef.id,
        gateway: payment.txnRef.gateway,
        amount: payment.amount.amount.toString(),
        currency: payment.amount.currency,
        precision: String(payment.amount.precision),
        status: payment.status,
        verifiedAt: payment.verifiedAt.toISOString(),
        updatedAt: payment.updatedAt.toISOString(),
      })
    )
  }

  async acquireIdempotencyKey(key: string): Promise<boolean> {
    const result = await this.redis.set(`idem:${key}`, '1', 'NX')
    return result === 'OK'
  }
}
```

`SET ... NX` only succeeds when the key does not exist, which makes the claim
atomic. Add an expiry (`EX`) if keys should age out.

## Using it for idempotent fulfillment

```ts
async function fulfill(gateway: GatewayAdapter, payment: VerifiedPayment) {
  const claimed = await store.acquireIdempotencyKey(payment.orderId)
  if (!claimed) return // a replay; already handled

  await store.savePayment(paymentFromVerified(payment))
  if (payment.status === 'completed') {
    await ship(payment.orderId)
  }
}
```

## See also

- [Reconciliation](./reconciliation.md) — polling `status()` for missing callbacks
- [Getting started](./getting-started.md) — the full lifecycle
