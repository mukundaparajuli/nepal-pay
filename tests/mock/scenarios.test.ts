import { describe, it, expect } from 'vitest'
import { mockGateway, order } from './helpers.js'

describe('mock scenarios', () => {
  it('success: pays and verifies as completed', async () => {
    const gateway = mockGateway({ secretKey: 'k' })
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const raw = await gateway.generateCallback(result.txnRef)
    const payment = await gateway.verify(gateway.parseCallback(raw), {
      expected: order(),
    })
    expect(payment.status).toBe('completed')
  })

  it('failed: pays and verifies as failed', async () => {
    const gateway = mockGateway({ scenario: 'failed' })
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const raw = await gateway.generateCallback(result.txnRef)
    const payment = await gateway.verify(gateway.parseCallback(raw), {
      expected: order(),
    })
    expect(payment.status).toBe('failed')
  })

  it('pending: verifies as pending and can be settled to completed', async () => {
    const gateway = mockGateway({ scenario: 'pending' })
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const pending = await gateway.verify(
      gateway.parseCallback(await gateway.generateCallback(result.txnRef)),
      { expected: order() }
    )
    expect(pending.status).toBe('pending')
    await gateway.settle(result.txnRef)
    const completed = await gateway.status(result.txnRef)
    expect(completed.status).toBe('completed')
  })

  it('expired: the link is already expired on checkout', async () => {
    const gateway = mockGateway({ scenario: 'expired' })
    const result = await gateway.createCheckout(order())
    const raw = await gateway.generateCallback(result.txnRef)
    const payment = await gateway.verify(gateway.parseCallback(raw), {
      expected: order(),
    })
    expect(payment.status).toBe('expired')
  })

  it('abandoned: never pays, status stays pending and no callback is emitted', async () => {
    const gateway = mockGateway({ scenario: 'abandoned' })
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    expect((await gateway.status(result.txnRef)).status).toBe('pending')
    await expect(gateway.generateCallback(result.txnRef)).rejects.toMatchObject(
      {
        code: 'UNKNOWN_TRANSACTION',
      }
    )
    await gateway.expire(result.txnRef)
    expect((await gateway.status(result.txnRef)).status).toBe('expired')
  })

  it('delayed: settles immediately but delivers the callback after a delay', async () => {
    const gateway = mockGateway({ scenario: 'delayed', delayMs: 30 })
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    expect((await gateway.status(result.txnRef)).status).toBe('completed')
    const started = Date.now()
    const raw = await gateway.generateCallback(result.txnRef)
    expect(Date.now() - started).toBeGreaterThanOrEqual(25)
    const payment = await gateway.verify(gateway.parseCallback(raw), {
      expected: order(),
    })
    expect(payment.status).toBe('completed')
  })

  it('duplicate: the same callback verifies identically every time', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const first = await gateway.generateCallback(result.txnRef)
    const second = await gateway.generateCallback(result.txnRef)
    expect(first).toEqual(second)
    const a = await gateway.verify(gateway.parseCallback(first), {
      expected: order(),
    })
    const b = await gateway.verify(gateway.parseCallback(second), {
      expected: order(),
    })
    expect(a.status).toBe('completed')
    expect(b.status).toBe('completed')
  })

  it('timeout: status lookup aborts within the timeout window', async () => {
    const gateway = mockGateway({ scenario: 'timeout', timeoutMs: 30 })
    const result = await gateway.createCheckout(order())
    const started = Date.now()
    let aborted = false
    try {
      await gateway.status(result.txnRef)
    } catch (error) {
      aborted = error instanceof DOMException && error.name === 'AbortError'
    }
    expect(aborted).toBe(true)
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('invalid-signature: the emitted callback is rejected on verify', async () => {
    const gateway = mockGateway({ scenario: 'invalid-signature' })
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const raw = await gateway.generateCallback(result.txnRef)
    await expect(
      gateway.verify(gateway.parseCallback(raw), { expected: order() })
    ).rejects.toMatchObject({
      code: 'SIGNATURE_MISMATCH',
    })
  })
})
