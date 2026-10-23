import { describe, it, expect } from 'vitest'
import { createOrder, moneyFromDecimal, PaymentError } from '@nepal-pay/core'
import type { Order } from '@nepal-pay/core'

describe('Order', () => {
  it('creates order with required fields', () => {
    const order: Order = {
      id: 'ORD001',
      amount: moneyFromDecimal('100.00'),
    }
    expect(order.id).toBe('ORD001')
    expect(order.amount.amount).toBe(10000n)
  })

  it('creates order with description', () => {
    const order: Order = {
      id: 'ORD002',
      amount: moneyFromDecimal('500.00'),
      description: 'Test product',
    }
    expect(order.description).toBe('Test product')
  })

  it('description is optional and omitted by default', () => {
    const order: Order = {
      id: 'ORD003',
      amount: moneyFromDecimal('75.50'),
    }
    expect(order.description).toBeUndefined()
    expect('description' in order).toBe(false)
  })

  it('uses NPR currency money with default precision', () => {
    const order: Order = {
      id: 'ORD004',
      amount: moneyFromDecimal('1000'),
    }
    expect(order.amount.currency).toBe('NPR')
    expect(order.amount.precision).toBe(2)
    expect(order.amount.amount).toBe(100000n)
  })
})

describe('createOrder', () => {
  it('creates a frozen order with extended fields', () => {
    const order = createOrder({
      id: 'ORD100',
      amount: moneyFromDecimal('250.00'),
      description: 'Premium plan',
      productName: 'Premium',
      customerName: 'Ram Sharma',
      customerEmail: 'ram@example.com',
      customerPhone: '9800000000',
      metadata: { tier: 'gold' },
      returnUrl: 'https://shop.example/ok',
      failureUrl: 'https://shop.example/fail',
      callbackUrl: 'https://shop.example/cb',
    })
    expect(order.id).toBe('ORD100')
    expect(order.metadata?.tier).toBe('gold')
    expect(Object.isFrozen(order)).toBe(true)
    expect(Object.isFrozen(order.metadata)).toBe(true)
  })

  it('rejects an empty order id', () => {
    expect(() =>
      createOrder({ id: '', amount: moneyFromDecimal('10.00') })
    ).toThrow(PaymentError)
  })

  it('rejects an overlong order id', () => {
    expect(() =>
      createOrder({ id: 'x'.repeat(101), amount: moneyFromDecimal('10.00') })
    ).toThrow(PaymentError)
  })

  it('rejects a zero amount', () => {
    expect(() =>
      createOrder({ id: 'ORD001', amount: moneyFromDecimal('0.00') })
    ).toThrow(PaymentError)
  })

  it('rejects a negative amount', () => {
    expect(() =>
      createOrder({ id: 'ORD001', amount: moneyFromDecimal('-10.00') })
    ).toThrow(PaymentError)
  })

  it('rejects malformed URLs', () => {
    expect(() =>
      createOrder({
        id: 'ORD001',
        amount: moneyFromDecimal('10.00'),
        returnUrl: 'not a url',
      })
    ).toThrow(PaymentError)
    expect(() =>
      createOrder({
        id: 'ORD001',
        amount: moneyFromDecimal('10.00'),
        callbackUrl: 'javascript:alert(1)',
      })
    ).toThrow(PaymentError)
  })

  it('accepts http and https URLs', () => {
    expect(() =>
      createOrder({
        id: 'ORD001',
        amount: moneyFromDecimal('10.00'),
        returnUrl: 'http://shop.example/ok',
        callbackUrl: 'https://shop.example/cb',
      })
    ).not.toThrow()
  })

  it('rejects non-string metadata values', () => {
    expect(() =>
      createOrder({
        id: 'ORD001',
        amount: moneyFromDecimal('10.00'),
        metadata: { qty: 2 } as unknown as Record<string, string>,
      })
    ).toThrow(PaymentError)
  })
})
