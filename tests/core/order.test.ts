import { describe, it, expect } from 'vitest'
import { moneyFromDecimal } from '@nepal-payments/core'
import type { Order } from '@nepal-payments/core'

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
