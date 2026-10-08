import { describe, it, expect } from 'vitest'
import { PaymentError } from '@nepal-payments/core'
import { testGateway } from './helpers.js'
import { COMPLETED_PIDX, COMPLETED_TXN, captureError } from './helpers.js'

function successQuery(): Record<string, string> {
  return {
    pidx: COMPLETED_PIDX,
    status: 'Completed',
    transaction_id: COMPLETED_TXN,
    tidx: COMPLETED_TXN,
    txnId: COMPLETED_TXN,
    amount: '1000',
    total_amount: '1000',
    mobile: '98XXXXX904',
    purchase_order_id: 'test12',
    purchase_order_name: 'test',
  }
}

describe('khalti callback parsing', () => {
  it('parses a valid success callback from the query', () => {
    const callback = testGateway().parseCallback({ query: successQuery() })
    expect(callback.gateway).toBe('khalti')
    expect(callback.data).toMatchObject({
      pidx: COMPLETED_PIDX,
      status: 'Completed',
      purchase_order_id: 'test12',
      amount: '1000',
      total_amount: '1000',
    })
  })

  it('parses a canceled callback with empty transaction fields', () => {
    const callback = testGateway().parseCallback({
      query: {
        pidx: COMPLETED_PIDX,
        transaction_id: '',
        tidx: '',
        amount: '1000',
        total_amount: '1000',
        mobile: '',
        status: 'User canceled',
        purchase_order_id: 'test12',
        purchase_order_name: 'test',
      },
    })
    expect(callback.data.status).toBe('User canceled')
    expect(callback.data.transaction_id).toBe('')
  })

  it('passes through headers and body', () => {
    const callback = testGateway().parseCallback({
      query: successQuery(),
      headers: { 'user-agent': 'Khalti' },
      body: 'raw',
    })
    expect(callback.headers).toEqual({ 'user-agent': 'Khalti' })
    expect(callback.body).toBe('raw')
  })

  it('accepts a single-element array param as a string', () => {
    const callback = testGateway().parseCallback({
      query: { ...successQuery(), pidx: [COMPLETED_PIDX] },
    })
    expect(callback.data.pidx).toBe(COMPLETED_PIDX)
  })

  it('does not mutate the original query', () => {
    const query = successQuery()
    const callback = testGateway().parseCallback({ query })
    expect(query.pidx).toBe(COMPLETED_PIDX)
    expect(callback.data).not.toBe(query)
    expect(Object.keys(callback.data).sort()).toEqual(Object.keys(query).sort())
  })

  it('rejects a missing pidx (failure-style ?message= callbacks)', async () => {
    const error = await captureError(() =>
      testGateway().parseCallback({
        query: { message: 'Could not process the payment.' },
      })
    )
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })

  it('rejects an empty pidx', async () => {
    const error = await captureError(() =>
      testGateway().parseCallback({ query: { ...successQuery(), pidx: '' } })
    )
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })

  it('rejects duplicate pidx values', async () => {
    const error = await captureError(() =>
      testGateway().parseCallback({
        query: { ...successQuery(), pidx: [COMPLETED_PIDX, 'OTHER'] },
      })
    )
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })

  it('rejects a query that is not a parameter record', async () => {
    const error = await captureError(() =>
      testGateway().parseCallback({
        query: ['a', 'b'] as unknown as Record<string, unknown>,
      })
    )
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })

  it('rejects a callback with no query at all', async () => {
    const error = await captureError(() => testGateway().parseCallback({}))
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })
})
