import { describe, it, expect } from 'vitest'
import {
  PaymentError,
  createOrder,
  isCompletedPayment,
  isVerifiedPayment,
  moneyFromDecimal,
  paymentFromVerified,
} from '@nepal-payments/core'
import { createVerifiedPayment } from '@nepal-payments/core/internal'
import { createMockGateway } from '@nepal-payments/mock'

const TXN_REF = { id: 'mock_security_1', gateway: 'mock' } as const

function order() {
  return createOrder({ id: 'ORD-SEC-1', amount: moneyFromDecimal('230.00') })
}

function sealed(status: 'completed' | 'failed' | 'pending') {
  return createVerifiedPayment({
    __unverified: true,
    orderId: 'ORD-SEC-1',
    amount: moneyFromDecimal('230.00'),
    status,
    txnRef: TXN_REF,
  })
}

describe('an unpaid order can never become a completed payment', () => {
  it('refuses to store a hand-built completed object', () => {
    const forged = {
      orderId: 'ORD-SEC-1',
      amount: moneyFromDecimal('230.00'),
      status: 'completed',
      txnRef: TXN_REF,
      verifiedAt: new Date(),
    }
    expect(isVerifiedPayment(forged)).toBe(false)
    expect(isCompletedPayment(forged)).toBe(false)
    expect(() => paymentFromVerified(forged as never)).toThrow(PaymentError)
    try {
      paymentFromVerified(forged as never)
    } catch (error) {
      expect((error as PaymentError).code).toBe('UNVERIFIED_PAYMENT')
    }
  })

  it('keeps the seal out of the public API surface', async () => {
    const publicApi = await import('@nepal-payments/core')
    expect('createVerifiedPayment' in publicApi).toBe(false)
  })

  it('cannot be forged by copying a legitimately sealed payment', () => {
    const genuine = sealed('completed')
    const copy = { ...genuine }
    expect(isVerifiedPayment(copy)).toBe(false)
    expect(isCompletedPayment(copy)).toBe(false)
    expect(() => paymentFromVerified(copy as never)).toThrow(PaymentError)
  })

  it('cannot be forged by re-adding the copied own keys', () => {
    const genuine = sealed('completed')
    const rebuilt = Object.assign({}, genuine, {
      [Symbol.for('nepal-payments.verified-payment')]: true,
    })
    expect(isVerifiedPayment(rebuilt)).toBe(false)
    expect(isCompletedPayment(rebuilt)).toBe(false)
  })

  it('is deeply frozen and cannot be mutated from failed to completed', () => {
    const payment = sealed('failed')
    expect(Object.isFrozen(payment)).toBe(true)
    expect(Object.isFrozen(payment.amount)).toBe(true)
    expect(Object.isFrozen(payment.txnRef)).toBe(true)
    expect(() => {
      ;(payment as unknown as { status: string }).status = 'completed'
    }).toThrow()
    expect(payment.status).toBe('failed')
    expect(isCompletedPayment(payment)).toBe(false)
  })

  it('reports completed only when the seal and the status agree', () => {
    expect(isCompletedPayment(sealed('completed'))).toBe(true)
    expect(isCompletedPayment(sealed('pending'))).toBe(false)
    expect(isCompletedPayment(sealed('failed'))).toBe(false)
  })

  it('will not emit a callback for an order that was never paid', async () => {
    const gateway = createMockGateway({ secretKey: 'audit-secret' })
    const { txnRef } = await gateway.createCheckout(order())
    await expect(gateway.generateCallback(txnRef)).rejects.toMatchObject({
      code: 'UNKNOWN_TRANSACTION',
    })
  })

  it('seals ledger truth, not a forged callback status, for an unpaid order', async () => {
    const gateway = createMockGateway({ secretKey: 'audit-secret' })
    const { txnRef } = await gateway.createCheckout(order())
    const payment = await gateway.status(txnRef)
    expect(payment.status).not.toBe('completed')
    expect(isCompletedPayment(payment)).toBe(false)
  })

  it('rejects non-positive amounts at the seal', () => {
    expect(() =>
      createVerifiedPayment({
        __unverified: true,
        orderId: 'ORD-SEC-1',
        amount: moneyFromDecimal('0.00'),
        status: 'completed',
        txnRef: TXN_REF,
      })
    ).toThrow(PaymentError)
  })
})
