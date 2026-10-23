import { describe, it, expect } from 'vitest'
import {
  VerificationError,
  moneyFromDecimal,
  type UnverifiedCallback,
} from '@nepal-pay/core'
import { isVerifiedPayment } from '@nepal-pay/core'
import {
  COMPLETED_PIDX,
  COMPLETED_TXN,
  captureError,
  order,
  stubRequest,
  testGateway,
} from './helpers.js'

function completedLookup(overrides: Record<string, unknown> = {}) {
  return {
    pidx: COMPLETED_PIDX,
    total_amount: 23000,
    status: 'Completed',
    transaction_id: COMPLETED_TXN,
    fee: 0,
    refunded: false,
    ...overrides,
  }
}

function successCallback(overrides: Record<string, unknown> = {}) {
  return {
    gateway: 'khalti' as const,
    data: {
      pidx: COMPLETED_PIDX,
      status: 'Completed',
      transaction_id: COMPLETED_TXN,
      tidx: COMPLETED_TXN,
      amount: '23000',
      total_amount: '23000',
      mobile: '98XXXXX904',
      purchase_order_id: 'ORD001',
      purchase_order_name: 'Consultation',
      ...overrides,
    },
  }
}

function gatewayWithLookup(
  lookupBody: Record<string, unknown>,
  lookupStatus = 200
) {
  return testGateway({
    fetch: stubRequest(() => ({ status: lookupStatus, body: lookupBody }))
      .fetch,
  })
}

describe('khalti verification', () => {
  it('verifies callback + lookup into a sealed completed payment', async () => {
    const gateway = gatewayWithLookup(completedLookup())
    const payment = await gateway.verify(successCallback(), {
      expected: order(),
    })
    expect(isVerifiedPayment(payment)).toBe(true)
    expect(payment.status).toBe('completed')
    expect(payment.orderId).toBe('ORD001')
    expect(payment.amount.amount).toBe(23000n)
    expect(payment.txnRef).toEqual({ id: COMPLETED_PIDX, gateway: 'khalti' })
    expect(payment.raw).toBeDefined()
    expect((payment.raw as { lookup?: unknown }).lookup).toBeDefined()
  })

  it('seals a pending payment when the lookup is authoritative', async () => {
    const gateway = gatewayWithLookup(
      completedLookup({ status: 'Pending', transaction_id: null })
    )
    const payment = await gateway.verify(successCallback(), {
      expected: order(),
    })
    expect(payment.status).toBe('pending')
  })

  it('seals canceled transactions', async () => {
    const gateway = gatewayWithLookup(
      completedLookup({ status: 'User canceled', transaction_id: null }),
      400
    )
    const payment = await gateway.verify(successCallback(), {
      expected: order(),
    })
    expect(payment.status).toBe('canceled')
  })

  it('seals expired transactions', async () => {
    const gateway = gatewayWithLookup(
      completedLookup({ status: 'Expired', transaction_id: null }),
      400
    )
    const payment = await gateway.verify(successCallback(), {
      expected: order(),
    })
    expect(payment.status).toBe('expired')
  })

  it('seals refunded transactions as unknown', async () => {
    const gateway = gatewayWithLookup(
      completedLookup({ status: 'Refunded', refunded: true })
    )
    const payment = await gateway.verify(successCallback(), {
      expected: order(),
    })
    expect(payment.status).toBe('unknown')
  })

  it('rejects mismatched callback amounts', async () => {
    const gateway = gatewayWithLookup(completedLookup())
    const error = await captureError(() =>
      gateway.verify(successCallback({ amount: '1000' }), {
        expected: order(),
      })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('AMOUNT_MISMATCH')
  })

  it('rejects mismatched callback total_amount', async () => {
    const gateway = gatewayWithLookup(completedLookup())
    const error = await captureError(() =>
      gateway.verify(successCallback({ total_amount: '1000' }), {
        expected: order(),
      })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('AMOUNT_MISMATCH')
  })

  it('rejects non-integer callback amounts', async () => {
    const gateway = gatewayWithLookup(completedLookup())
    const error = await captureError(() =>
      gateway.verify(successCallback({ amount: '230.50' }), {
        expected: order(),
      })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('INVALID_AMOUNT')
  })

  it('rejects a mismatched lookup amount even when the callback lies', async () => {
    const gateway = gatewayWithLookup(completedLookup({ total_amount: 1000 }))
    const callback = successCallback({ amount: '23000', total_amount: '23000' })
    const error = await captureError(() =>
      gateway.verify(callback, { expected: order() })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('AMOUNT_MISMATCH')
  })

  it('rejects a mismatched callback purchase_order_id', async () => {
    const gateway = gatewayWithLookup(completedLookup())
    const error = await captureError(() =>
      gateway.verify(successCallback({ purchase_order_id: 'ORD-HACK' }), {
        expected: order(),
      })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('ORDER_MISMATCH')
  })

  it('rejects a missing callback purchase_order_id', async () => {
    const gateway = gatewayWithLookup(completedLookup())
    const callback = successCallback()
    delete (callback.data as Record<string, unknown>).purchase_order_id
    const error = await captureError(() =>
      gateway.verify(callback, { expected: order() })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('ORDER_MISMATCH')
  })

  it('rejects a lookup purchase_order_id mismatch', async () => {
    const gateway = gatewayWithLookup(
      completedLookup({ purchase_order_id: 'ORD-HACK' })
    )
    const error = await captureError(() =>
      gateway.verify(successCallback(), { expected: order() })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('ORDER_MISMATCH')
  })

  it('rejects callbacks for other gateways', async () => {
    const gateway = gatewayWithLookup(completedLookup())
    const error = await captureError(() =>
      gateway.verify(
        { ...successCallback(), gateway: 'esewa' },
        {
          expected: order(),
        }
      )
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('GATEWAY_MISMATCH')
  })

  it('rejects callbacks without a pidx', async () => {
    const gateway = gatewayWithLookup(completedLookup())
    const error = await captureError(() =>
      gateway.verify(
        { gateway: 'khalti', data: {} } as unknown as UnverifiedCallback,
        { expected: order() }
      )
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('MALFORMED_CALLBACK')
  })

  it('rejects a completed lookup without a transaction_id', async () => {
    const gateway = gatewayWithLookup(completedLookup({ transaction_id: null }))
    const error = await captureError(() =>
      gateway.verify(successCallback(), { expected: order() })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('INVALID_TXN_REF')
  })

  it('raises UNKNOWN_TRANSACTION when the pidx does not exist', async () => {
    const gateway = testGateway({
      fetch: stubRequest(() => ({
        status: 400,
        body: { detail: 'Not found.', error_key: 'validation_error' },
      })).fetch,
    })
    const error = await captureError(() =>
      gateway.verify(successCallback(), { expected: order() })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('UNKNOWN_TRANSACTION')
  })

  it('foreign-order verification fails on order id mismatch', async () => {
    const gateway = gatewayWithLookup(completedLookup())
    const error = await captureError(() =>
      gateway.verify(successCallback(), {
        expected: order({ id: 'ORD002' }),
      })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('ORDER_MISMATCH')
  })
})

describe('khalti status', () => {
  it('seals a completed status with the expected order', async () => {
    const gateway = gatewayWithLookup(
      completedLookup({ purchase_order_id: 'ORD001' })
    )
    const payment = await gateway.status(
      { id: COMPLETED_PIDX, gateway: 'khalti' },
      { expected: order() }
    )
    expect(payment.status).toBe('completed')
    expect(payment.orderId).toBe('ORD001')
  })

  it('derives the orderId from the lookup purchase_order_id', async () => {
    const gateway = gatewayWithLookup(
      completedLookup({ purchase_order_id: 'ORD001' })
    )
    const payment = await gateway.status({
      id: COMPLETED_PIDX,
      gateway: 'khalti',
    })
    expect(payment.orderId).toBe('ORD001')
    expect(payment.amount.amount).toBe(23000n)
  })

  it('requires an expected order when the lookup has no purchase_order_id', async () => {
    const gateway = gatewayWithLookup(completedLookup())
    const error = await captureError(() =>
      gateway.status({ id: COMPLETED_PIDX, gateway: 'khalti' })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('ORDER_MISMATCH')
  })

  it('rejects a lookup amount mismatch against expected', async () => {
    const gateway = gatewayWithLookup(
      completedLookup({ purchase_order_id: 'ORD001', total_amount: 1000 })
    )
    const error = await captureError(() =>
      gateway.status(
        { id: COMPLETED_PIDX, gateway: 'khalti' },
        { expected: order() }
      )
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('AMOUNT_MISMATCH')
  })

  it('rejects a lookup purchase_order_id mismatch against expected', async () => {
    const gateway = gatewayWithLookup(
      completedLookup({ purchase_order_id: 'ORD-HACK' })
    )
    const error = await captureError(() =>
      gateway.status(
        { id: COMPLETED_PIDX, gateway: 'khalti' },
        { expected: order() }
      )
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('ORDER_MISMATCH')
  })

  it('rejects txn refs from other gateways', async () => {
    const gateway = gatewayWithLookup(completedLookup())
    const error = await captureError(() =>
      gateway.status({ id: COMPLETED_PIDX, gateway: 'esewa' })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('GATEWAY_MISMATCH')
  })

  it('rejects malformed pidx values', async () => {
    const gateway = gatewayWithLookup(completedLookup())
    for (const id of ['bad pidx!', 'has/slash', '']) {
      const error = await captureError(() =>
        gateway.status({ id, gateway: 'khalti' })
      )
      expect(error).toBeInstanceOf(VerificationError)
      expect((error as VerificationError).code).toBe('INVALID_TXN_REF')
    }
  })

  it('seals a non-positive amount as an error without expected', async () => {
    const gateway = gatewayWithLookup(
      completedLookup({
        purchase_order_id: 'ORD001',
        total_amount: 0,
        status: 'Pending',
        transaction_id: null,
      })
    )
    const error = await captureError(() =>
      gateway.status({ id: COMPLETED_PIDX, gateway: 'khalti' })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('INVALID_AMOUNT')
  })

  it('scales a zero-precision expected amount into paisa for comparison', async () => {
    const gateway = gatewayWithLookup(completedLookup({ total_amount: 23000 }))
    const payment = await gateway.status(
      { id: COMPLETED_PIDX, gateway: 'khalti' },
      { expected: order({ amount: moneyFromDecimal('230', 'NPR', 0) }) }
    )
    expect(payment.status).toBe('completed')
    expect(payment.amount).toEqual({
      amount: 230n,
      currency: 'NPR',
      precision: 0,
    })
  })
})
