import { describe, it, expect } from 'vitest'
import {
  InMemoryPaymentStore,
  createInMemoryPaymentStore,
  paymentFromVerified,
  moneyFromDecimal,
  createOrder,
  isVerifiedPayment,
  type Payment,
  type PaymentStore,
} from '@nepal-pay/core'
import { createVerifiedPayment } from '@nepal-pay/core/internal'

function verified(status: 'pending' | 'completed' = 'completed') {
  return createVerifiedPayment({
    __unverified: true,
    orderId: 'ORD-STORE-1',
    amount: moneyFromDecimal('100.00'),
    status,
    txnRef: { id: 'txn-store-1', gateway: 'mock' },
    raw: { gatewayRef: 'ABC' },
  })
}

function payment(overrides: Partial<Payment> = {}): Payment {
  const base = paymentFromVerified(verified())
  return { ...base, ...overrides }
}

describe('paymentFromVerified', () => {
  it('builds a plain payment from a sealed payment', () => {
    const sealed = verified()
    const stored = paymentFromVerified(sealed, new Date(1000))
    expect(stored.orderId).toBe('ORD-STORE-1')
    expect(stored.status).toBe('completed')
    expect(stored.txnRef).toEqual({ id: 'txn-store-1', gateway: 'mock' })
    expect(stored.amount.amount).toBe(10000n)
    expect(stored.verifiedAt.getTime()).toBe(sealed.verifiedAt.getTime())
    expect(stored.updatedAt.getTime()).toBe(1000)
    expect(stored.raw).toEqual({ gatewayRef: 'ABC' })
  })

  it('rejects an unverified payment', () => {
    expect(() =>
      paymentFromVerified({
        orderId: 'ORD-STORE-1',
        amount: moneyFromDecimal('1.00'),
        status: 'completed',
        txnRef: { id: 'x', gateway: 'mock' },
        verifiedAt: new Date(),
      } as never)
    ).toThrowError(expect.objectContaining({ code: 'UNVERIFIED_PAYMENT' }))
  })
})

describe('InMemoryPaymentStore', () => {
  it('saves and reads back a payment by order id', async () => {
    const store = new InMemoryPaymentStore()
    const record = payment({ status: 'pending' })
    await store.savePayment(record)
    const found = await store.getPayment('ORD-STORE-1')
    expect(found).not.toBeNull()
    expect(found?.status).toBe('pending')
    expect(found?.txnRef.id).toBe('txn-store-1')
    expect(found?.amount.amount).toBe(10000n)
  })

  it('returns null for an unknown order', async () => {
    const store = new InMemoryPaymentStore()
    expect(await store.getPayment('NOPE')).toBeNull()
  })

  it('upserts on save', async () => {
    const store = new InMemoryPaymentStore()
    await store.savePayment(payment({ status: 'pending' }))
    await store.savePayment(payment({ status: 'completed' }))
    expect((await store.getPayment('ORD-STORE-1'))?.status).toBe('completed')
  })

  it('stores a defensive copy', async () => {
    const store = new InMemoryPaymentStore()
    const record = payment({ status: 'pending' })
    await store.savePayment(record)
    ;(record as { status: string }).status = 'completed'
    expect((await store.getPayment('ORD-STORE-1'))?.status).toBe('pending')
  })

  it('does not leak mutable dates or money objects', async () => {
    const store = new InMemoryPaymentStore()
    await store.savePayment(payment({ status: 'completed' }))
    const first = await store.getPayment('ORD-STORE-1')
    const second = await store.getPayment('ORD-STORE-1')
    expect(first?.amount).not.toBe(second?.amount)
    expect(first?.verifiedAt).not.toBe(second?.verifiedAt)
  })

  it('rejects an invalid order id', async () => {
    const store = new InMemoryPaymentStore()
    await expect(
      store.savePayment(payment({ orderId: '' }))
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_ID' })
  })

  it('rejects an invalid txnRef', async () => {
    const store = new InMemoryPaymentStore()
    await expect(
      store.savePayment(payment({ txnRef: { id: '', gateway: 'mock' } }))
    ).rejects.toMatchObject({ code: 'INVALID_TXN_REF' })
  })

  it('claims an idempotency key exactly once', async () => {
    const store = new InMemoryPaymentStore()
    expect(await store.acquireIdempotencyKey('order-1')).toBe(true)
    expect(await store.acquireIdempotencyKey('order-1')).toBe(false)
    expect(await store.acquireIdempotencyKey('order-2')).toBe(true)
  })

  it('claims concurrently without duplicates', async () => {
    const store = new InMemoryPaymentStore()
    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.acquireIdempotencyKey('race'))
    )
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('rejects an empty idempotency key', async () => {
    const store = new InMemoryPaymentStore()
    await expect(store.acquireIdempotencyKey('')).rejects.toMatchObject({
      code: 'INVALID_IDEMPOTENCY_KEY',
    })
  })

  it('clears all state', async () => {
    const store = new InMemoryPaymentStore()
    await store.savePayment(payment())
    await store.acquireIdempotencyKey('k')
    store.clear()
    expect(await store.getPayment('ORD-STORE-1')).toBeNull()
    expect(await store.acquireIdempotencyKey('k')).toBe(true)
  })

  it('is created by the factory', () => {
    const store = createInMemoryPaymentStore()
    expect(store).toBeInstanceOf(InMemoryPaymentStore)
  })
})

describe('custom user-provided stores', () => {
  class MapStore implements PaymentStore {
    private readonly payments = new Map<string, Payment>()
    private readonly keys = new Set<string>()

    async getPayment(orderId: string): Promise<Payment | null> {
      return this.payments.get(orderId) ?? null
    }

    async savePayment(record: Payment): Promise<void> {
      this.payments.set(record.orderId, record)
    }

    async acquireIdempotencyKey(key: string): Promise<boolean> {
      if (this.keys.has(key)) return false
      this.keys.add(key)
      return true
    }
  }

  async function fulfilOnce(
    store: PaymentStore,
    orderId: string
  ): Promise<string> {
    const claimed = await store.acquireIdempotencyKey(orderId)
    if (!claimed) return 'replay'
    await store.savePayment(payment({ orderId }))
    return 'fulfilled'
  }

  it('satisfies the PaymentStore contract', async () => {
    const store: PaymentStore = new MapStore()
    expect(await fulfilOnce(store, 'ORD-CUSTOM-1')).toBe('fulfilled')
    expect(await fulfilOnce(store, 'ORD-CUSTOM-1')).toBe('replay')
    const saved = await store.getPayment('ORD-CUSTOM-1')
    expect(saved?.status).toBe('completed')
    expect(isVerifiedPayment(saved)).toBe(false)
  })

  it('can be swapped for the in-memory store', async () => {
    const stores: PaymentStore[] = [new InMemoryPaymentStore(), new MapStore()]
    for (const store of stores) {
      expect(await store.acquireIdempotencyKey('once')).toBe(true)
      expect(await store.acquireIdempotencyKey('once')).toBe(false)
    }
  })

  it('accepts a stored order built by createOrder', async () => {
    const store = new MapStore()
    const order = createOrder({
      id: 'ORD-FROM-ORDER',
      amount: moneyFromDecimal('50.00'),
    })
    expect(order.id).toBe('ORD-FROM-ORDER')
    expect(await store.getPayment(order.id)).toBeNull()
  })
})
