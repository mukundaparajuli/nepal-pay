import { describe, it, expect } from 'vitest'
import { VerificationError, moneyFromDecimal } from '@nepal-payments/core'
import { khaltiPaisaToMoney, mapKhaltiStatus } from '@nepal-payments/khalti'
import {
  COMPLETED_PIDX,
  SANDBOX_LOOKUP_URL,
  SANDBOX_SECRET,
  captureError,
  order,
  stubRequest,
  testGateway,
} from './helpers.js'

describe('khalti status mapping', () => {
  it('maps Khalti statuses to the unified payment status set', () => {
    expect(mapKhaltiStatus('Completed')).toBe('completed')
    expect(mapKhaltiStatus('Pending')).toBe('pending')
    expect(mapKhaltiStatus('Initiated')).toBe('pending')
    expect(mapKhaltiStatus('User canceled')).toBe('canceled')
    expect(mapKhaltiStatus('Expired')).toBe('expired')
    expect(mapKhaltiStatus('Refunded')).toBe('unknown')
    expect(mapKhaltiStatus('Partially Refunded')).toBe('unknown')
    expect(mapKhaltiStatus('partially refunded')).toBe('unknown')
  })

  it('maps unknown or malformed statuses to unknown', () => {
    expect(mapKhaltiStatus('whatever')).toBe('unknown')
    expect(mapKhaltiStatus(42)).toBe('unknown')
    expect(mapKhaltiStatus(undefined)).toBe('unknown')
    expect(mapKhaltiStatus('')).toBe('unknown')
  })

  it('converts paisa amounts to Money', () => {
    expect(khaltiPaisaToMoney(1000)).toEqual({
      amount: 1000n,
      currency: 'NPR',
      precision: 2,
    })
    expect(khaltiPaisaToMoney('1000')).toEqual({
      amount: 1000n,
      currency: 'NPR',
      precision: 2,
    })
  })

  it('rejects malformed amounts', async () => {
    for (const value of [undefined, null, '1.5', 'abc', {}, 1.5]) {
      expect(() => khaltiPaisaToMoney(value)).toThrow(VerificationError)
    }
  })

  it('rejects amounts beyond the safe integer range', async () => {
    expect(() => khaltiPaisaToMoney(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      VerificationError
    )
  })
})

describe('khalti lookup', () => {
  it('parses a completed lookup into a sealed payment', async () => {
    const gateway = testGateway({
      fetch: stubRequest(() => ({
        body: {
          pidx: COMPLETED_PIDX,
          total_amount: 1000,
          status: 'Completed',
          transaction_id: 'GFq9PFS7b2iYvL8Lir9oXe',
          fee: 0,
          refunded: false,
        },
      })).fetch,
    })
    const payment = await gateway.status(
      { id: COMPLETED_PIDX, gateway: 'khalti' },
      { expected: order({ amount: moneyFromDecimal('10.00') }) }
    )
    expect(payment.status).toBe('completed')
    expect(payment.orderId).toBe('ORD001')
    expect(payment.amount.amount).toBe(1000n)
    expect(payment.txnRef).toEqual({ id: COMPLETED_PIDX, gateway: 'khalti' })
  })

  it('parses an expired lookup despite the HTTP 400 status', async () => {
    const { fetch } = stubRequest(() => ({
      status: 400,
      body: {
        pidx: COMPLETED_PIDX,
        total_amount: 1000,
        status: 'Expired',
        transaction_id: null,
        fee: 0,
        refunded: false,
      },
    }))
    const gateway = testGateway({ fetch })
    const payment = await gateway.status(
      { id: COMPLETED_PIDX, gateway: 'khalti' },
      { expected: order({ amount: moneyFromDecimal('10.00') }) }
    )
    expect(payment.status).toBe('expired')
  })

  it('parses a user-canceled lookup despite the HTTP 400 status', async () => {
    const { fetch } = stubRequest(() => ({
      status: 400,
      body: {
        pidx: COMPLETED_PIDX,
        total_amount: 1000,
        status: 'User canceled',
        transaction_id: null,
        fee: 0,
        refunded: false,
      },
    }))
    const gateway = testGateway({ fetch })
    const payment = await gateway.status(
      { id: COMPLETED_PIDX, gateway: 'khalti' },
      { expected: order({ amount: moneyFromDecimal('10.00') }) }
    )
    expect(payment.status).toBe('canceled')
  })

  it('raises UNKNOWN_TRANSACTION for an unknown pidx', async () => {
    const gateway = testGateway({
      fetch: stubRequest(() => ({
        status: 400,
        body: { detail: 'Not found.', error_key: 'validation_error' },
      })).fetch,
    })
    const error = await captureError(() =>
      gateway.status({ id: COMPLETED_PIDX, gateway: 'khalti' })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('UNKNOWN_TRANSACTION')
  })

  it('raises INVALID_STATUS for an invalid token error', async () => {
    const gateway = testGateway({
      fetch: stubRequest(() => ({
        status: 401,
        body: { detail: 'Invalid token.', status_code: 401 },
      })).fetch,
    })
    const error = await captureError(() =>
      gateway.status({ id: COMPLETED_PIDX, gateway: 'khalti' })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('INVALID_STATUS')
    expect((error as VerificationError).message).toContain('Invalid token.')
  })

  it('raises INVALID_STATUS on malformed JSON', async () => {
    const gateway = testGateway({
      fetch: stubRequest(() => ({ text: '<not json>' })).fetch,
    })
    const error = await captureError(() =>
      gateway.status({ id: COMPLETED_PIDX, gateway: 'khalti' })
    )
    expect(error).toBeInstanceOf(VerificationError)
    expect((error as VerificationError).code).toBe('INVALID_STATUS')
  })

  it('raises on non-object JSON bodies', async () => {
    for (const body of [['a', 'b'], null, 42, 'str']) {
      const gateway = testGateway({
        fetch: stubRequest(() => ({ body })).fetch,
      })
      const error = await captureError(() =>
        gateway.status({ id: COMPLETED_PIDX, gateway: 'khalti' })
      )
      expect(error).toBeInstanceOf(VerificationError)
    }
  })

  it('raises INVALID_AMOUNT for a malformed total_amount', async () => {
    for (const total of [undefined, '1.5', 'abc', 1.5, {}, null]) {
      const gateway = testGateway({
        fetch: stubRequest(() => ({
          body: {
            pidx: COMPLETED_PIDX,
            total_amount: total,
            status: 'Completed',
            transaction_id: null,
            fee: 0,
            refunded: false,
          },
        })).fetch,
      })
      const error = await captureError(() =>
        gateway.status({ id: COMPLETED_PIDX, gateway: 'khalti' })
      )
      expect(error).toBeInstanceOf(VerificationError)
      expect((error as VerificationError).code).toBe('INVALID_AMOUNT')
    }
  })

  it('accepts a numeric string total_amount', async () => {
    const gateway = testGateway({
      fetch: stubRequest(() => ({
        body: {
          pidx: COMPLETED_PIDX,
          total_amount: '1000',
          status: 'Completed',
          transaction_id: 'GFq9PFS7b2iYvL8Lir9oXe',
          fee: 0,
          refunded: false,
        },
      })).fetch,
    })
    const payment = await gateway.status(
      { id: COMPLETED_PIDX, gateway: 'khalti' },
      { expected: order({ amount: moneyFromDecimal('10.00') }) }
    )
    expect(payment.amount.amount).toBe(1000n)
  })

  it('sends the Authorization and JSON headers to the lookup endpoint', async () => {
    const { fetch, calls } = stubRequest(() => ({
      body: {
        pidx: COMPLETED_PIDX,
        total_amount: 23000,
        status: 'Completed',
        transaction_id: 'GFq9PFS7b2iYvL8Lir9oXe',
        fee: 0,
        refunded: false,
      },
    }))
    const gateway = testGateway({ fetch })
    await gateway.status(
      { id: COMPLETED_PIDX, gateway: 'khalti' },
      { expected: order() }
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(SANDBOX_LOOKUP_URL)
    expect(calls[0]?.init?.headers).toMatchObject({
      authorization: `Key ${SANDBOX_SECRET}`,
      'content-type': 'application/json',
    })
    expect(calls[0]?.body).toEqual({ pidx: COMPLETED_PIDX })
  })

  it('aborts instead of hanging when lookup never responds', async () => {
    const gateway = testGateway({
      fetch: (async (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'))
          })
        })) as unknown as typeof globalThis.fetch,
      timeoutMs: 50,
    })
    const error = await captureError(() =>
      gateway.status({ id: COMPLETED_PIDX, gateway: 'khalti' })
    )
    expect(error).toBeDefined()
    expect((error as Error).name).toBe('AbortError')
  })
})
