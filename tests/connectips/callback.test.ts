import { describe, it, expect } from 'vitest'
import { PaymentError } from '@nepal-payments/core'
import { parseConnectIpsCallback } from '@nepal-payments/connectips'

function capture(fn: () => unknown): unknown {
  try {
    return fn()
  } catch (error) {
    return error
  }
}

describe('parseConnectIpsCallback', () => {
  it('parses TXNID from the redirect query string', () => {
    const callback = parseConnectIpsCallback({
      query: { TXNID: 'txn-123' },
      headers: { host: 'merchant.example' },
    })
    expect(callback.gateway).toBe('connectips')
    expect(callback.data).toEqual({ TXNID: 'txn-123' })
    expect(callback.headers).toEqual({ host: 'merchant.example' })
  })

  it('falls back to a form-encoded or object body', () => {
    expect(parseConnectIpsCallback({ body: 'TXNID=txn-123' }).data).toEqual({
      TXNID: 'txn-123',
    })
    expect(
      parseConnectIpsCallback({ body: { TXNID: 'txn-456' } }).data
    ).toEqual({ TXNID: 'txn-456' })
  })

  it('prefers the query over the body', () => {
    expect(
      parseConnectIpsCallback({
        query: { TXNID: 'txn-query' },
        body: { TXNID: 'txn-body' },
      }).data
    ).toEqual({ TXNID: 'txn-query' })
  })

  it('rejects a callback without a TXNID', () => {
    for (const request of [{}, { query: {} }, { query: { TXNID: '' } }]) {
      const error = capture(() => parseConnectIpsCallback(request))
      expect(error).toBeInstanceOf(PaymentError)
      expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
    }
  })

  it('rejects a malformed TXNID', () => {
    const error = capture(() =>
      parseConnectIpsCallback({ query: { TXNID: 'bad id!' } })
    )
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })
})
