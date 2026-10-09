import { describe, it, expect } from 'vitest'
import {
  safeBase64Encode,
  isVerifiedPayment,
  NepalPaymentsError,
  type CheckoutResult,
  type Order,
  type RawCallbackRequest,
  type TxnRef,
  type VerifiedPayment,
} from '@nepal-payments/core'
import { signMockCallback, type MockGateway } from '@nepal-payments/mock'
import { MOCK_SECRET, isAbortError, mockGateway, order } from './helpers.js'

interface MerchantStore {
  readonly orders: Map<string, Order>
  readonly checkouts: Map<string, string>
  readonly fulfilled: Map<string, number>
}

function merchant(): MerchantStore {
  return {
    orders: new Map(),
    checkouts: new Map(),
    fulfilled: new Map(),
  }
}

function fulfilledCount(store: MerchantStore, orderId: string): number {
  return store.fulfilled.get(orderId) ?? 0
}

function fulfill(store: MerchantStore, orderId: string): void {
  if (store.fulfilled.has(orderId)) return
  store.fulfilled.set(orderId, 1)
}

async function attempt(fn: () => unknown | Promise<unknown>): Promise<unknown> {
  try {
    return await fn()
  } catch (error) {
    return error
  }
}

async function startCheckout(
  store: MerchantStore,
  gateway: MockGateway,
  order: Order
): Promise<CheckoutResult> {
  store.orders.set(order.id, order)
  const result = await gateway.createCheckout(order)
  store.checkouts.set(result.txnRef.id, order.id)
  return result
}

async function handleCallback(
  store: MerchantStore,
  gateway: MockGateway,
  raw: RawCallbackRequest
): Promise<VerifiedPayment> {
  const callback = gateway.parseCallback(raw)
  const txnId = String(callback.data.txn_id ?? '')
  const orderId = store.checkouts.get(txnId)
  if (orderId === undefined) {
    throw new Error('callback references an unknown checkout')
  }
  const expected = store.orders.get(orderId)
  if (expected === undefined) {
    throw new Error('order not found')
  }
  const payment = await gateway.verify(callback, { expected })
  if (payment.status === 'completed') {
    fulfill(store, payment.orderId)
  }
  return payment
}

async function handleStatus(
  store: MerchantStore,
  gateway: MockGateway,
  txnRef: TxnRef
): Promise<VerifiedPayment> {
  const orderId = store.checkouts.get(txnRef.id)
  if (orderId === undefined) {
    throw new Error('status check for an unknown checkout')
  }
  const expected = store.orders.get(orderId)
  if (expected === undefined) {
    throw new Error('order not found')
  }
  const payment = await gateway.status(txnRef, { expected })
  if (payment.status === 'completed') {
    fulfill(store, payment.orderId)
  }
  return payment
}

describe('mock gateway merchant integration', () => {
  it('success: runs Order -> Checkout -> Callback -> Verification -> Fulfillment', async () => {
    const gateway = mockGateway({ scenario: 'success' })
    const store = merchant()
    const expected = order()

    const checkout = await startCheckout(store, gateway, expected)
    expect(checkout.checkout.type).toBe('redirect')
    expect(checkout.checkout.url).toBe(
      `https://mock.invalid/pay/code/${checkout.txnRef.id}`
    )

    await gateway.pay(checkout.txnRef)
    const payment = await handleCallback(
      store,
      gateway,
      await gateway.generateCallback(checkout.txnRef)
    )

    expect(isVerifiedPayment(payment)).toBe(true)
    expect(payment.status).toBe('completed')
    expect(payment.orderId).toBe(expected.id)
    expect(fulfilledCount(store, expected.id)).toBe(1)
  })

  it('failed: seals the failed callback and never fulfills', async () => {
    const gateway = mockGateway({ scenario: 'failed' })
    const store = merchant()
    const expected = order()

    const checkout = await startCheckout(store, gateway, expected)
    await gateway.pay(checkout.txnRef)
    const payment = await handleCallback(
      store,
      gateway,
      await gateway.generateCallback(checkout.txnRef)
    )

    expect(payment.status).toBe('failed')
    expect(fulfilledCount(store, expected.id)).toBe(0)
  })

  it('pending: defers fulfillment until settle() completes via status()', async () => {
    const gateway = mockGateway({ scenario: 'pending' })
    const store = merchant()
    const expected = order()

    const checkout = await startCheckout(store, gateway, expected)
    await gateway.pay(checkout.txnRef)
    const callbackPayment = await handleCallback(
      store,
      gateway,
      await gateway.generateCallback(checkout.txnRef)
    )
    expect(callbackPayment.status).toBe('pending')
    expect(fulfilledCount(store, expected.id)).toBe(0)

    await gateway.settle(checkout.txnRef)
    const polled = await handleStatus(store, gateway, checkout.txnRef)
    expect(polled.status).toBe('completed')
    expect(fulfilledCount(store, expected.id)).toBe(1)
  })

  it('expired: reports expired through both callback and status', async () => {
    const gateway = mockGateway({ scenario: 'expired' })
    const store = merchant()
    const expected = order()

    const checkout = await startCheckout(store, gateway, expected)
    const payment = await handleCallback(
      store,
      gateway,
      await gateway.generateCallback(checkout.txnRef)
    )
    expect(payment.status).toBe('expired')
    expect(fulfilledCount(store, expected.id)).toBe(0)

    const polled = await handleStatus(store, gateway, checkout.txnRef)
    expect(polled.status).toBe('expired')
    expect(fulfilledCount(store, expected.id)).toBe(0)
  })

  it('abandoned: never emits a callback and expires through controls', async () => {
    const gateway = mockGateway({ scenario: 'abandoned' })
    const store = merchant()
    const expected = order()

    const checkout = await startCheckout(store, gateway, expected)
    await gateway.pay(checkout.txnRef)

    const error = await attempt(() => gateway.generateCallback(checkout.txnRef))
    expect(error).toBeInstanceOf(NepalPaymentsError)
    expect((error as NepalPaymentsError).code).toBe('UNKNOWN_TRANSACTION')
    expect(fulfilledCount(store, expected.id)).toBe(0)

    const beforeExpiry = await handleStatus(store, gateway, checkout.txnRef)
    expect(beforeExpiry.status).toBe('pending')

    await gateway.expire(checkout.txnRef)
    const afterExpiry = await handleStatus(store, gateway, checkout.txnRef)
    expect(afterExpiry.status).toBe('expired')
    expect(fulfilledCount(store, expected.id)).toBe(0)
  })

  it('delayed: completes only after the settlement delay', async () => {
    const gateway = mockGateway({ scenario: 'delayed', delayMs: 15 })
    const store = merchant()
    const expected = order()

    const checkout = await startCheckout(store, gateway, expected)
    await gateway.pay(checkout.txnRef)

    const started = Date.now()
    const payment = await handleCallback(
      store,
      gateway,
      await gateway.generateCallback(checkout.txnRef)
    )
    const elapsed = Date.now() - started

    expect(payment.status).toBe('completed')
    expect(elapsed).toBeGreaterThanOrEqual(10)
    expect(fulfilledCount(store, expected.id)).toBe(1)
  })

  it('duplicate: verifies both callbacks but fulfills exactly once', async () => {
    const gateway = mockGateway({ scenario: 'duplicate' })
    const store = merchant()
    const expected = order()

    const checkout = await startCheckout(store, gateway, expected)
    await gateway.pay(checkout.txnRef)

    const first = await handleCallback(
      store,
      gateway,
      await gateway.generateCallback(checkout.txnRef)
    )
    const second = await handleCallback(
      store,
      gateway,
      await gateway.generateCallback(checkout.txnRef)
    )

    expect(first.status).toBe('completed')
    expect(second.status).toBe('completed')
    expect(fulfilledCount(store, expected.id)).toBe(1)
  })

  it('timeout: aborts lookups without fulfilling', async () => {
    const gateway = mockGateway({ scenario: 'timeout', timeoutMs: 50 })
    const store = merchant()
    const expected = order()

    const checkout = await startCheckout(store, gateway, expected)
    await gateway.pay(checkout.txnRef)

    const viaCallback = await attempt(async () =>
      handleCallback(
        store,
        gateway,
        await gateway.generateCallback(checkout.txnRef)
      )
    )
    expect(viaCallback).toBeInstanceOf(Error)
    expect(isAbortError(viaCallback)).toBe(true)
    expect(fulfilledCount(store, expected.id)).toBe(0)

    const viaStatus = await attempt(async () =>
      handleStatus(store, gateway, checkout.txnRef)
    )
    expect(viaStatus).toBeInstanceOf(Error)
    expect(isAbortError(viaStatus)).toBe(true)
    expect(fulfilledCount(store, expected.id)).toBe(0)
  })

  it('invalid-signature: rejects the callback and never fulfills', async () => {
    const gateway = mockGateway({ scenario: 'invalid-signature' })
    const store = merchant()
    const expected = order()

    const checkout = await startCheckout(store, gateway, expected)
    await gateway.pay(checkout.txnRef)

    const error = await attempt(async () =>
      handleCallback(
        store,
        gateway,
        await gateway.generateCallback(checkout.txnRef)
      )
    )
    expect(error).toBeInstanceOf(NepalPaymentsError)
    expect((error as NepalPaymentsError).code).toBe('SIGNATURE_MISMATCH')
    expect(fulfilledCount(store, expected.id)).toBe(0)
  })

  it('rejects callbacks that reference an unknown checkout', async () => {
    const gateway = mockGateway({ scenario: 'success' })
    const store = merchant()
    const expected = order()
    await startCheckout(store, gateway, expected)

    const signature = await signMockCallback(
      {
        txn_id: 'mock_notmine000001',
        order_id: expected.id,
        amount: '23000',
        status: 'completed',
      },
      MOCK_SECRET
    )
    const raw: RawCallbackRequest = {
      query: {
        data: safeBase64Encode(
          JSON.stringify({
            txn_id: 'mock_notmine000001',
            order_id: expected.id,
            amount: '23000',
            status: 'completed',
            signature,
          })
        ),
      },
    }

    const error = await attempt(() => handleCallback(store, gateway, raw))
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).toContain('unknown checkout')
    expect(fulfilledCount(store, expected.id)).toBe(0)
  })
})
