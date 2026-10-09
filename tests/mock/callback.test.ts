import { describe, it, expect } from 'vitest'
import { PaymentError, safeBase64Encode } from '@nepal-payments/core'
import { signMockCallback } from '@nepal-payments/mock'
import { mockGateway, MOCK_SECRET } from './helpers.js'

async function makeData(
  overrides: Record<string, string> = {}
): Promise<string> {
  const values = {
    txn_id: 'mock_9f86d081884c7d65',
    order_id: 'ORD-MOCK-1',
    amount: '23000',
    status: 'completed',
    ...overrides,
  }
  const { txn_id, order_id, amount, status, ...rest } = values
  const signature = await signMockCallback(
    { txn_id, order_id, amount, status },
    MOCK_SECRET
  )
  return safeBase64Encode(JSON.stringify({ ...values, signature, ...rest }))
}

describe('mock parseCallback', () => {
  it('parses a well-formed data field into an unverified callback', async () => {
    const gateway = mockGateway()
    const callback = await gateway.parseCallback({
      query: { data: await makeData() },
    })
    expect(callback.gateway).toBe('mock')
    expect(callback.data['txn_id']).toBe('mock_9f86d081884c7d65')
    expect(callback.data['order_id']).toBe('ORD-MOCK-1')
    expect(callback.data['amount']).toBe('23000')
    expect(callback.data['status']).toBe('completed')
    expect(typeof callback.data['signature']).toBe('string')
    expect(callback.data['signature']).toHaveLength(64)
  })

  it('rejects a missing query record', () => {
    const gateway = mockGateway()
    expect(() => gateway.parseCallback({})).toThrow(PaymentError)
  })

  it('rejects a missing data field', () => {
    const gateway = mockGateway()
    expect(() => gateway.parseCallback({ query: {} })).toThrow(PaymentError)
  })

  it('rejects a non-string data field', () => {
    const gateway = mockGateway()
    expect(() => gateway.parseCallback({ query: { data: 123 } })).toThrow(
      PaymentError
    )
  })

  it('rejects invalid base64 data', () => {
    const gateway = mockGateway()
    expect(() =>
      gateway.parseCallback({ query: { data: '%%%not-base64%%%' } })
    ).toThrow(PaymentError)
  })

  it('rejects non-canonical base64 data', () => {
    const gateway = mockGateway()
    const padded = safeBase64Encode(JSON.stringify({}))
    expect(() =>
      gateway.parseCallback({ query: { data: padded + '=' } })
    ).toThrow(PaymentError)
  })

  it('rejects data that is not JSON', async () => {
    const gateway = mockGateway()
    expect(() =>
      gateway.parseCallback({
        query: { data: safeBase64Encode('just-a-string') },
      })
    ).toThrow(PaymentError)
  })

  it('rejects JSON that is not an object', async () => {
    const gateway = mockGateway()
    expect(() =>
      gateway.parseCallback({
        query: { data: safeBase64Encode('[1, 2, 3]') },
      })
    ).toThrow(PaymentError)
  })

  it('rejects a payload missing required fields', async () => {
    const gateway = mockGateway()
    const data = safeBase64Encode(JSON.stringify({ txn_id: 'x' }))
    expect(() => gateway.parseCallback({ query: { data } })).toThrow(
      PaymentError
    )
  })

  it('rejects a payload with a non-string field', async () => {
    const gateway = mockGateway()
    const data = safeBase64Encode(
      JSON.stringify({
        txn_id: 'mock_9f86d081884c7d65',
        order_id: 'ORD-MOCK-1',
        amount: 23000,
        status: 'completed',
        signature: 'x'.repeat(64),
      })
    )
    expect(() => gateway.parseCallback({ query: { data } })).toThrow(
      PaymentError
    )
  })

  it('keeps an optional user field when present', async () => {
    const gateway = mockGateway()
    const callback = await gateway.parseCallback({
      query: {
        data: await makeData({
          txn_id: 'mock_9f86d081884c7d65',
          user: '9800000000',
        }),
      },
    })
    expect(callback.data['user']).toBe('9800000000')
  })

  it('produces a deterministic fingerprint for identical requests', async () => {
    const gateway = mockGateway()
    const data = await makeData()
    const raw = { query: { data } }
    const first = gateway.parseCallback(raw)
    const second = gateway.parseCallback(raw)
    const { callbackFingerprint } = await import('@nepal-payments/core')
    expect(await callbackFingerprint(first)).toBe(
      await callbackFingerprint(second)
    )
  })
})
