import { describe, it, expect } from 'vitest'
import {
  PAYMENT_STATUSES,
  isPaymentStatus,
  type PaymentStatus,
} from '@nepal-pay/core'

describe('payment states', () => {
  it('defines exactly the six payment states', () => {
    expect(PAYMENT_STATUSES).toEqual([
      'pending',
      'completed',
      'failed',
      'canceled',
      'expired',
      'unknown',
    ])
  })

  it('accepts every defined state', () => {
    for (const status of PAYMENT_STATUSES) {
      expect(isPaymentStatus(status)).toBe(true)
    }
  })

  it('rejects values outside the state set', () => {
    expect(isPaymentStatus('cancelled')).toBe(false)
    expect(isPaymentStatus('refunded')).toBe(false)
    expect(isPaymentStatus('SUCCESS')).toBe(false)
    expect(isPaymentStatus('')).toBe(false)
    expect(isPaymentStatus('pending ')).toBe(false)
    expect(isPaymentStatus(42)).toBe(false)
    expect(isPaymentStatus(null)).toBe(false)
    expect(isPaymentStatus(undefined)).toBe(false)
    expect(isPaymentStatus({ status: 'pending' })).toBe(false)
    expect(isPaymentStatus(['pending'])).toBe(false)
  })

  it('PaymentStatus type only admits defined states', () => {
    const status: PaymentStatus = 'canceled'
    expect(status).toBe('canceled')
    // @ts-expect-error 'refunded' is not a payment state
    const invalid: PaymentStatus = 'refunded'
    expect(invalid).toBe('refunded')
  })
})
