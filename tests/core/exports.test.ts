import { describe, it, expect } from 'vitest'
import * as core from '@nepal-pay/core'

describe('public export surface', () => {
  it('does not expose the payment factory at runtime', () => {
    expect('createVerifiedPayment' in core).toBe(false)
  })

  it('does not expose the removed toMoney helper', () => {
    expect('toMoney' in core).toBe(false)
  })

  it('exposes the seal guard and constructors', () => {
    expect(typeof core.isVerifiedPayment).toBe('function')
    expect(typeof core.createOrder).toBe('function')
    expect(typeof core.createMoney).toBe('function')
    expect(typeof core.moneyFromDecimal).toBe('function')
    expect(typeof core.isMoney).toBe('function')
    expect(typeof core.callbackFingerprint).toBe('function')
    expect(typeof core.sha256).toBe('function')
    expect(typeof core.hmacSha256).toBe('function')
    expect(typeof core.verifySha256).toBe('function')
    expect(typeof core.verifyHmacSha256).toBe('function')
  })

  it('exposes the error hierarchy and payment methods', () => {
    expect(typeof core.PaymentError).toBe('function')
    expect(typeof core.VerificationError).toBe('function')
    expect(typeof core.ConfigurationError).toBe('function')
    expect(typeof core.MoneyError).toBe('function')
    expect(typeof core.NepalPayError).toBe('function')
    expect(core.PAYMENT_METHODS).toEqual([
      'esewa',
      'khalti',
      'connectips',
      'fonepay',
      'mock',
    ])
    expect(core.isPaymentMethod('esewa')).toBe(true)
    expect(core.isPaymentMethod('mock')).toBe(true)
    expect(core.isPaymentMethod('someone')).toBe(false)
  })
})
