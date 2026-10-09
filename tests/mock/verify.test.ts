import { describe, it, expect } from 'vitest'
import {
  isVerifiedPayment,
  safeBase64Encode,
  VerificationError,
  type RawCallbackRequest,
  type UnverifiedCallback,
} from '@nepal-payments/core'
import { signMockCallback } from '@nepal-payments/mock'
import type { MockGateway } from '@nepal-payments/mock'
import {
  captureError,
  isAbortError,
  mockGateway,
  MOCK_SECRET,
  order,
} from './helpers.js'

async function verifiedFlow(
  gateway: MockGateway = mockGateway(),
  orderOverride = order()
): Promise<{
  gateway: MockGateway
  payment: import('@nepal-payments/core').VerifiedPayment
}> {
  const result = await gateway.createCheckout(orderOverride)
  await gateway.pay(result.txnRef)
  const raw = await gateway.generateCallback(result.txnRef)
  const callback = gateway.parseCallback(raw)
  const payment = await gateway.verify(callback, { expected: orderOverride })
  return { gateway, payment }
}

async function signedCallback(
  values: {
    readonly txn_id: string
    readonly order_id: string
    readonly amount: string
    readonly status: string
    readonly [key: string]: string
  },
  secret = MOCK_SECRET
): Promise<UnverifiedCallback> {
  const signature = await signMockCallback(values, secret)
  const payload = { ...values, signature }
  const raw: RawCallbackRequest = {
    query: { data: safeBase64Encode(JSON.stringify(payload)) },
  }
  return mockGateway().parseCallback(raw)
}

describe('mock verify', () => {
  it('seals a completed payment from the authoritative ledger', async () => {
    const { payment } = await verifiedFlow()
    expect(isVerifiedPayment(payment)).toBe(true)
    expect(payment.status).toBe('completed')
    expect(payment.orderId).toBe('ORD-MOCK-1')
    expect(payment.amount.amount).toBe(23000n)
    expect(payment.txnRef).toEqual({
      id: expect.stringMatching(/^mock_[0-9a-f]+$/),
      gateway: 'mock',
    })
  })

  it('rejects a callback for another gateway', async () => {
    await verifiedFlow()
    const gateway = mockGateway()
    const callback = { gateway: 'khalti' as const, data: {} }
    const error = await captureError(() =>
      gateway.verify(callback, { expected: order() })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('GATEWAY_MISMATCH')
  })

  it('rejects an invalid signature (invalid-signature scenario)', async () => {
    const gateway = mockGateway({ scenario: 'invalid-signature' })
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const raw = await gateway.generateCallback(result.txnRef)
    const error = await captureError(() =>
      gateway.verify(gateway.parseCallback(raw), { expected: order() })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('SIGNATURE_MISMATCH')
  })

  it('rejects a callback signed with a different secret', async () => {
    const callback = await signedCallback(
      {
        txn_id: 'mock_9f86d081884c7d65',
        order_id: 'ORD-MOCK-1',
        amount: '23000',
        status: 'completed',
      },
      'a-completely-different-secret'
    )
    const gateway = mockGateway()
    const error = await captureError(() =>
      gateway.verify(callback, { expected: order() })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('SIGNATURE_MISMATCH')
  })

  it('rejects a tampered amount (signature invalidated)', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const good = (await gateway.generateCallback(result.txnRef)) as {
      query: { data: string }
    }
    const payload = JSON.parse(
      Buffer.from(good.query.data, 'base64').toString('utf8')
    ) as Record<string, string>
    payload.amount = '99999'
    const tampered = {
      query: { data: safeBase64Encode(JSON.stringify(payload)) },
    }
    const callback = gateway.parseCallback(tampered)
    const error = await captureError(() =>
      gateway.verify(callback, { expected: order() })
    )
    expect((error as VerificationError).code).toBe('SIGNATURE_MISMATCH')
  })

  it('rejects an amount that does not match the expected order', async () => {
    const callback = await signedCallback({
      txn_id: 'mock_9f86d081884c7d65',
      order_id: 'ORD-MOCK-1',
      amount: '10000',
      status: 'completed',
    })
    const gateway = mockGateway()
    const error = await captureError(() =>
      gateway.verify(callback, { expected: order() })
    )
    expect((error as VerificationError).code).toBe('AMOUNT_MISMATCH')
  })

  it('rejects an order id that does not match the expected order', async () => {
    const gateway = mockGateway()
    const callback = await signedCallback({
      txn_id: 'mock_9f86d081884c7d65',
      order_id: 'ORD-OTHER',
      amount: '23000',
      status: 'completed',
    })
    const error = await captureError(() =>
      gateway.verify(callback, { expected: order() })
    )
    expect((error as VerificationError).code).toBe('ORDER_MISMATCH')
  })

  it('seals pending when the ledger is processing', async () => {
    const gateway = mockGateway({ scenario: 'pending' })
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const raw = await gateway.generateCallback(result.txnRef)
    const payment = await gateway.verify(gateway.parseCallback(raw), {
      expected: order(),
    })
    expect(payment.status).toBe('pending')
    expect((payment.raw?.ledger as { status: string }).status).toBe('pending')
  })

  it('seals failed when the payment was rejected', async () => {
    const gateway = mockGateway({ scenario: 'failed' })
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const raw = await gateway.generateCallback(result.txnRef)
    const payment = await gateway.verify(gateway.parseCallback(raw), {
      expected: order(),
    })
    expect(payment.status).toBe('failed')
  })

  it('seals expired when the link expired', async () => {
    const gateway = mockGateway({ scenario: 'expired' })
    const result = await gateway.createCheckout(order())
    const raw = await gateway.generateCallback(result.txnRef)
    const payment = await gateway.verify(gateway.parseCallback(raw), {
      expected: order(),
    })
    expect(payment.status).toBe('expired')
  })

  it('prefers the ledger status over a forged callback status', async () => {
    const callback = await signedCallback({
      txn_id: 'mock_9f86d081884c7d65',
      order_id: 'ORD-MOCK-1',
      amount: '23000',
      status: 'completed',
    })
    // The callback claims completed, but the ledger has no record for the
    // transaction, so the authoritative lookup rejects it.
    const gateway = mockGateway()
    const error = await captureError(() =>
      gateway.verify(callback, { expected: order() })
    )
    expect((error as VerificationError).code).toBe('UNKNOWN_TRANSACTION')
  })

  it('aborts with AbortError when lookup times out', async () => {
    const gateway = mockGateway({ scenario: 'timeout', timeoutMs: 40 })
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const raw = await gateway.generateCallback(result.txnRef)
    const error = await captureError(() =>
      gateway.verify(gateway.parseCallback(raw), { expected: order() })
    )
    expect(isAbortError(error)).toBe(true)
  })

  it('handles duplicate callbacks idempotently', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const raw = await gateway.generateCallback(result.txnRef)
    const first = await gateway.verify(gateway.parseCallback(raw), {
      expected: order(),
    })
    const second = await gateway.verify(gateway.parseCallback(raw), {
      expected: order(),
    })
    expect(second.status).toBe(first.status)
    expect(second.orderId).toBe(first.orderId)
    expect(second.amount).toEqual(first.amount)
    expect(second.txnRef).toEqual(first.txnRef)
  })
})
