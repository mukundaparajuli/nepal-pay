import { describe, it, expect } from 'vitest'
import {
  createVerifiedPayment,
  isVerifiedPayment,
  moneyFromDecimal,
  PaymentError,
  type Money,
  type UnverifiedCallback,
  type VerifiedPayment,
  type VerifiedPaymentInput,
} from '@nepal-payments/core'

const validInput = (): VerifiedPaymentInput => ({
  orderId: 'ORD001',
  amount: moneyFromDecimal('100.00'),
  status: 'completed',
  txnRef: { id: 'TXN123', gateway: 'esewa' },
})

describe('createVerifiedPayment', () => {
  it('creates a verified payment from valid input', () => {
    const payment = createVerifiedPayment(validInput())
    expect(payment.orderId).toBe('ORD001')
    expect(payment.amount.amount).toBe(10000n)
    expect(payment.status).toBe('completed')
    expect(payment.txnRef).toEqual({ id: 'TXN123', gateway: 'esewa' })
    expect(isVerifiedPayment(payment)).toBe(true)
  })

  it('omits raw when not provided', () => {
    const payment = createVerifiedPayment(validInput())
    expect('raw' in payment).toBe(false)
  })

  it('includes raw when provided', () => {
    const payment = createVerifiedPayment({
      ...validInput(),
      raw: { ref: 'R1' },
    })
    expect(payment.raw).toEqual({ ref: 'R1' })
  })

  it('accepts every payment state', () => {
    for (const status of [
      'pending',
      'completed',
      'failed',
      'canceled',
      'expired',
      'unknown',
    ] as const) {
      const payment = createVerifiedPayment({ ...validInput(), status })
      expect(payment.status).toBe(status)
    }
  })

  it('rejects an empty orderId', () => {
    expect(() =>
      createVerifiedPayment({ ...validInput(), orderId: '' })
    ).toThrow(PaymentError)
  })

  it('rejects a non-Money amount', () => {
    const input = { ...validInput(), amount: '100.00' as unknown as Money }
    expect(() => createVerifiedPayment(input)).toThrow(PaymentError)
  })

  it('rejects an invalid status', () => {
    const input = {
      ...validInput(),
      status: 'refunded',
    } as unknown as VerifiedPaymentInput
    expect(() => createVerifiedPayment(input)).toThrow(PaymentError)
    expect(() => createVerifiedPayment(input)).toThrow(/Invalid payment status/)
  })

  it('rejects an invalid txnRef', () => {
    expect(() =>
      createVerifiedPayment({
        ...validInput(),
        txnRef: { id: '', gateway: 'esewa' },
      })
    ).toThrow(PaymentError)
  })
})

describe('trust boundary between callbacks and payments', () => {
  it('accepts untrusted callback data as a plain object', () => {
    const callback: UnverifiedCallback = {
      gateway: 'esewa',
      data: { amt: '100.00', refId: '77' },
    }
    expect(callback.gateway).toBe('esewa')
    expect(callback.data.refId).toBe('77')
    expect(isVerifiedPayment(callback)).toBe(false)
  })

  it('does not treat plain lookalike objects as verified payments', () => {
    expect(isVerifiedPayment({ ...validInput() })).toBe(false)
    expect(isVerifiedPayment(null)).toBe(false)
    expect(isVerifiedPayment(undefined)).toBe(false)
    expect(isVerifiedPayment('completed')).toBe(false)
    expect(isVerifiedPayment({ status: 'completed' })).toBe(false)
  })

  it('cannot be forged as a plain object literal', () => {
    // @ts-expect-error the verification seal cannot be set outside this package
    const forged: VerifiedPayment = {
      orderId: 'ORD001',
      amount: moneyFromDecimal('100.00'),
      status: 'completed',
      txnRef: { id: 'TXN123', gateway: 'esewa' },
    }
    expect(isVerifiedPayment(forged)).toBe(false)
  })

  it('rejects an unverified callback where a payment is expected', () => {
    const callback: UnverifiedCallback = {
      gateway: 'khalti',
      data: { amt: '100.00' },
    }
    const acceptsPayment = (payment: VerifiedPayment): boolean =>
      isVerifiedPayment(payment)
    // @ts-expect-error an UnverifiedCallback must never be accepted as a VerifiedPayment
    acceptsPayment(callback)
    expect(acceptsPayment(createVerifiedPayment(validInput()))).toBe(true)
  })

  it('rejects a verified payment where an unverified callback is expected', () => {
    const payment = createVerifiedPayment(validInput())
    const acceptsCallback = (callback: UnverifiedCallback): string =>
      callback.gateway
    // @ts-expect-error a VerifiedPayment must never be accepted as an UnverifiedCallback
    acceptsCallback(payment)
    expect(acceptsCallback({ gateway: 'esewa', data: {} })).toBe('esewa')
  })

  it('loses its seal through JSON serialization', () => {
    const payment = createVerifiedPayment(validInput())
    const json = JSON.stringify(payment, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value
    )
    const roundTripped: unknown = JSON.parse(json)
    expect(isVerifiedPayment(roundTripped)).toBe(false)
  })
})
