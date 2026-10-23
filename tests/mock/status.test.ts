import { describe, it, expect } from 'vitest'
import { VerificationError } from '@nepal-pay/core'
import { isAbortError, mockGateway, order } from './helpers.js'

describe('mock status', () => {
  it('reports completed after a successful payment', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const payment = await gateway.status(result.txnRef, { expected: order() })
    expect(payment.status).toBe('completed')
    expect(payment.orderId).toBe('ORD-MOCK-1')
    expect(payment.amount.amount).toBe(23000n)
  })

  it('reports pending while the payment is processing', async () => {
    const gateway = mockGateway({ scenario: 'pending' })
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const payment = await gateway.status(result.txnRef)
    expect(payment.status).toBe('pending')
  })

  it('reports failed after a rejected payment', async () => {
    const gateway = mockGateway({ scenario: 'failed' })
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const payment = await gateway.status(result.txnRef)
    expect(payment.status).toBe('failed')
  })

  it('reports expired when the link expired', async () => {
    const gateway = mockGateway({ scenario: 'expired' })
    const result = await gateway.createCheckout(order())
    const payment = await gateway.status(result.txnRef)
    expect(payment.status).toBe('expired')
  })

  it('reports pending for an abandoned (never-paid) link', async () => {
    const gateway = mockGateway({ scenario: 'abandoned' })
    const result = await gateway.createCheckout(order())
    const payment = await gateway.status(result.txnRef)
    expect(payment.status).toBe('pending')
  })

  it('becomes expired when an abandoned link is force-expired', async () => {
    const gateway = mockGateway({ scenario: 'abandoned' })
    const result = await gateway.createCheckout(order())
    expect((await gateway.status(result.txnRef)).status).toBe('pending')
    await gateway.expire(result.txnRef)
    const payment = await gateway.status(result.txnRef)
    expect(payment.status).toBe('expired')
  })

  it('reports canceled when the user canceled the payment', async () => {
    const gateway = mockGateway({ scenario: 'abandoned' })
    const result = await gateway.createCheckout(order())
    await gateway.setStatus(result.txnRef, 'canceled')
    const payment = await gateway.status(result.txnRef)
    expect(payment.status).toBe('canceled')
  })

  it('updates to completed after settling a pending payment', async () => {
    const gateway = mockGateway({ scenario: 'pending' })
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    await gateway.settle(result.txnRef)
    const payment = await gateway.status(result.txnRef)
    expect(payment.status).toBe('completed')
  })

  it('rejects a status call for another gateway', async () => {
    const gateway = mockGateway()
    await expect(
      gateway.status({ id: 'mock_9f86d081884c7d65', gateway: 'khalti' })
    ).rejects.toThrow(VerificationError)
  })

  it('rejects an unknown transaction id', async () => {
    const gateway = mockGateway()
    await expect(
      gateway.status({ id: 'mock_doesNotExist01', gateway: 'mock' })
    ).rejects.toMatchObject({
      code: 'UNKNOWN_TRANSACTION',
    })
  })

  it('rejects a malformed transaction id', async () => {
    const gateway = mockGateway()
    await expect(
      gateway.status({ id: 'not a valid id', gateway: 'mock' })
    ).rejects.toMatchObject({
      code: 'INVALID_TXN_REF',
    })
  })

  it('rejects an order mismatch when an expected order is given', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    await expect(
      gateway.status(result.txnRef, {
        expected: order({ id: 'ORD-OTHER' }),
      })
    ).rejects.toMatchObject({
      code: 'ORDER_MISMATCH',
    })
  })

  it('rejects an amount mismatch when an expected order is given', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    await expect(
      gateway.status(result.txnRef, {
        expected: order({
          amount: {
            amount: 5000n,
            currency: 'NPR' as const,
            precision: 2,
          },
        }),
      })
    ).rejects.toMatchObject({
      code: 'AMOUNT_MISMATCH',
    })
  })

  it('aborts with AbortError when lookup times out', async () => {
    const gateway = mockGateway({ scenario: 'timeout', timeoutMs: 40 })
    const result = await gateway.createCheckout(order())
    const error = await (async () => {
      try {
        await gateway.status(result.txnRef)
        return undefined
      } catch (caught) {
        return caught
      }
    })()
    expect(isAbortError(error)).toBe(true)
  })
})
