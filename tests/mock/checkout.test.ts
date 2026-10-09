import { describe, it, expect } from 'vitest'
import { PaymentError } from '@nepal-payments/core'
import { mockGateway, order } from './helpers.js'

describe('mock checkout', () => {
  it('creates a redirect checkout with a txnRef and a ledger entry', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(order())
    expect(result.checkout.type).toBe('redirect')
    expect(result.checkout.url).toMatch(/^https:\/\/mock\.invalid\/pay\/code\//)
    expect(result.txnRef.gateway).toBe('mock')
    const entry = gateway.ledger.get(result.txnRef.id)
    expect(entry?.orderId).toBe('ORD-MOCK-1')
    expect(entry?.amount).toBe(23000n)
    expect(entry?.status).toBe('initiated')
  })

  it('places the transaction id in the redirect url', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(order())
    expect(result.checkout.url).toContain(`/code/${result.txnRef.id}`)
  })

  it('accepts an explicit txn id', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(order(), {
      txnId: 'mock_myCustomTxn01',
    })
    expect(result.txnRef.id).toBe('mock_myCustomTxn01')
  })

  it('rejects a malformed explicit txn id', async () => {
    const gateway = mockGateway()
    await expect(
      gateway.createCheckout(order(), { txnId: 'not valid' })
    ).rejects.toThrow(PaymentError)
  })

  it('creates an expired ledger entry in the expired scenario', async () => {
    const gateway = mockGateway({ scenario: 'expired' })
    const result = await gateway.createCheckout(order())
    expect(gateway.ledger.get(result.txnRef.id)?.status).toBe('expired')
  })

  it('rejects a non-positive amount', async () => {
    const gateway = mockGateway()
    const invalid = {
      id: 'ORD-MOCK-1',
      amount: { amount: 0n, currency: 'NPR' as const, precision: 2 },
    }
    await expect(gateway.createCheckout(invalid)).rejects.toThrow(PaymentError)
  })

  it('rejects a precision above 2', async () => {
    const gateway = mockGateway()
    const invalid = {
      id: 'ORD-MOCK-1',
      amount: { amount: 123450n, currency: 'NPR' as const, precision: 3 },
    }
    await expect(gateway.createCheckout(invalid)).rejects.toThrow(PaymentError)
  })

  it('scales amounts with precision below 2 into paisa', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(
      order({
        amount: { amount: 12345n, currency: 'NPR', precision: 1 },
      })
    )
    expect(gateway.ledger.get(result.txnRef.id)?.amount).toBe(123450n)
  })

  it('registers unique transaction ids on repeated checkouts', async () => {
    const gateway = mockGateway()
    const first = await gateway.createCheckout(order())
    const second = await gateway.createCheckout(order())
    expect(first.txnRef.id).not.toBe(second.txnRef.id)
    expect(gateway.ledger.size).toBe(2)
  })
})
