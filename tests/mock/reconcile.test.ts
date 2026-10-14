import { describe, it, expect } from 'vitest'
import { reconcile } from '@nepal-payments/core'
import { mockGateway, order } from './helpers.js'

describe('reconcile with the mock gateway', () => {
  it('resolves a pending payment once it settles', async () => {
    const gateway = mockGateway({ scenario: 'pending' })
    const expected = order()
    const { txnRef } = await gateway.createCheckout(expected)
    await gateway.pay(txnRef)

    let settled = false
    const result = await reconcile(
      gateway,
      { order: expected, txnRef },
      {
        maxAttempts: 5,
        backoffMs: 10,
        sleep: async () => {
          if (!settled) {
            settled = true
            await gateway.settle(txnRef)
          }
        },
      }
    )

    expect(result.resolved).toBe(true)
    expect(result.reason).toBe('terminal')
    expect(result.status).toBe('completed')
    expect(result.attempts).toBe(2)
  })

  it('reports unresolved while a payment stays pending', async () => {
    const gateway = mockGateway({ scenario: 'pending' })
    const expected = order()
    const { txnRef } = await gateway.createCheckout(expected)
    await gateway.pay(txnRef)

    const result = await reconcile(
      gateway,
      { order: expected, txnRef },
      { maxAttempts: 2, sleep: async () => undefined }
    )

    expect(result.resolved).toBe(false)
    expect(result.reason).toBe('exhausted')
    expect(result.status).toBe('pending')
  })
})
