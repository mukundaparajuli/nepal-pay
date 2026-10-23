import { describe, it, expect } from 'vitest'
import {
  createOrder,
  isVerifiedPayment,
  moneyEquals,
  moneyFromDecimal,
  NepalPayError,
  type Order,
} from '@nepal-pay/core'
import { createConnectIps } from '@nepal-pay/connectips'
import { stubRequest } from '../khalti/helpers.js'
import { testConfig } from './helpers.js'

const ORDER: Order = createOrder({
  id: 'ORD-123',
  amount: moneyFromDecimal('230.00'),
})

const COMPLETED_RESPONSE = {
  merchantId: '550',
  appId: 'MER-550-APP-1',
  referenceId: 'ORD-123',
  txnAmt: '23000',
  token: null,
  status: 'SUCCESS',
  statusDesc: 'TRANSACTION SUCCESSFUL',
}

function gatewayReturning(body: unknown, status = 200) {
  const { fetch } = stubRequest(() => ({ body, status }))
  return createConnectIps(testConfig({ fetch }))
}

function completedCallback(id = 'ORD-123') {
  return { gateway: 'connectips' as const, data: { TXNID: id } }
}

async function capture(fn: () => unknown): Promise<unknown> {
  try {
    return await fn()
  } catch (error) {
    return error
  }
}

describe('verifyConnectIpsPayment', () => {
  it('seals a completed payment with the expected amount', async () => {
    const gateway = gatewayReturning(COMPLETED_RESPONSE)
    const payment = await gateway.verify(completedCallback(), {
      expected: ORDER,
    })
    expect(isVerifiedPayment(payment)).toBe(true)
    expect(payment.status).toBe('completed')
    expect(payment.orderId).toBe(ORDER.id)
    expect(payment.txnRef).toEqual({ id: 'ORD-123', gateway: 'connectips' })
    expect(moneyEquals(payment.amount, ORDER.amount)).toBe(true)
  })

  it('rejects an amount mismatch with AMOUNT_MISMATCH', async () => {
    const gateway = gatewayReturning({
      ...COMPLETED_RESPONSE,
      txnAmt: '999900',
    })
    const error = await capture(() =>
      gateway.verify(completedCallback(), { expected: ORDER })
    )
    expect(error).toBeInstanceOf(NepalPayError)
    expect((error as NepalPayError).code).toBe('AMOUNT_MISMATCH')
  })

  it('rejects an order mismatch before contacting the gateway', async () => {
    const { fetch, calls } = stubRequest(() => ({ body: COMPLETED_RESPONSE }))
    const gateway = createConnectIps(testConfig({ fetch }))
    const error = await capture(() =>
      gateway.verify(completedCallback('ORD-999'), { expected: ORDER })
    )
    expect((error as NepalPayError).code).toBe('ORDER_MISMATCH')
    expect(calls).toHaveLength(0)
  })

  it('rejects a callback for another gateway', async () => {
    const gateway = gatewayReturning(COMPLETED_RESPONSE)
    const error = await capture(() =>
      gateway.verify(
        { gateway: 'esewa', data: { TXNID: 'ORD-123' } },
        { expected: ORDER }
      )
    )
    expect((error as NepalPayError).code).toBe('GATEWAY_MISMATCH')
  })

  it('rejects a callback missing TXNID', async () => {
    const gateway = gatewayReturning(COMPLETED_RESPONSE)
    const error = await capture(() =>
      gateway.verify({ gateway: 'connectips', data: {} }, { expected: ORDER })
    )
    expect((error as NepalPayError).code).toBe('MALFORMED_CALLBACK')
  })

  it('seals failed when the upstream reports FAILED', async () => {
    const gateway = gatewayReturning({
      ...COMPLETED_RESPONSE,
      status: 'FAILED',
      statusDesc: 'TRANSACTION UNSUCCESSFUL',
    })
    const payment = await gateway.verify(completedCallback(), {
      expected: ORDER,
    })
    expect(payment.status).toBe('failed')
  })

  it('seals unknown when the upstream reports ERROR', async () => {
    const gateway = gatewayReturning({
      status: 'ERROR',
      statusDesc: 'TRANSACTION NOT FOUND',
    })
    const payment = await gateway.verify(completedCallback(), {
      expected: ORDER,
    })
    expect(payment.status).toBe('unknown')
  })

  it('rejects a response whose referenceId is for another transaction', async () => {
    const gateway = gatewayReturning({
      ...COMPLETED_RESPONSE,
      referenceId: 'ORD-OTHER',
    })
    const error = await capture(() =>
      gateway.verify(completedCallback(), { expected: ORDER })
    )
    expect((error as NepalPayError).code).toBe('UNKNOWN_TRANSACTION')
  })

  it('raises INVALID_STATUS for malformed upstream responses', async () => {
    const gateway = gatewayReturning({ hello: 'world' })
    const error = await capture(() =>
      gateway.verify(completedCallback(), { expected: ORDER })
    )
    expect((error as NepalPayError).code).toBe('INVALID_STATUS')
  })
})
