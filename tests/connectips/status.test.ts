import { describe, it, expect } from 'vitest'
import {
  createOrder,
  moneyEquals,
  moneyFromDecimal,
  NepalPaymentsError,
  type Order,
} from '@nepal-payments/core'
import {
  createConnectIps,
  mapConnectIpsStatus,
} from '@nepal-payments/connectips'
import { stubRequest } from '../khalti/helpers.js'
import { testConfig } from './helpers.js'

const ORDER: Order = createOrder({
  id: 'ORD-123',
  amount: moneyFromDecimal('230.00'),
})

function detailResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 'SUCCESS',
    statusDesc: 'TRANSACTION SUCCESSFUL',
    merchantId: '550',
    appId: 'MER-550-APP-1',
    referenceId: 'ORD-123',
    txnAmt: '23000',
    creditStatus: '000',
    ...overrides,
  }
}

function gatewayReturning(body: unknown) {
  const { fetch, calls } = stubRequest(() => ({ body }))
  return { gateway: createConnectIps(testConfig({ fetch })), calls }
}

async function capture(fn: () => unknown): Promise<unknown> {
  try {
    return await fn()
  } catch (error) {
    return error
  }
}

describe('mapConnectIpsStatus', () => {
  it('maps status and credit status per NCHL', () => {
    expect(mapConnectIpsStatus('SUCCESS')).toBe('completed')
    expect(mapConnectIpsStatus('SUCCESS', '000')).toBe('completed')
    expect(mapConnectIpsStatus('SUCCESS', '999')).toBe('completed')
    expect(mapConnectIpsStatus('SUCCESS', 'DEFER')).toBe('completed')
    expect(mapConnectIpsStatus('SUCCESS', '888')).toBe('failed')
    expect(mapConnectIpsStatus('FAILED')).toBe('failed')
    expect(mapConnectIpsStatus('ERROR')).toBe('unknown')
    expect(mapConnectIpsStatus('weird')).toBe('unknown')
    expect(mapConnectIpsStatus(undefined)).toBe('unknown')
  })
})

describe('checkConnectIpsStatus', () => {
  it('reports completed with an expected order', async () => {
    const { gateway } = gatewayReturning(detailResponse())
    const payment = await gateway.status(
      { id: 'ORD-123', gateway: 'connectips' },
      { expected: ORDER }
    )
    expect(payment.status).toBe('completed')
    expect(payment.orderId).toBe(ORDER.id)
    expect(moneyEquals(payment.amount, ORDER.amount)).toBe(true)
  })

  it('reports a positive amount without an expected order', async () => {
    const { gateway, calls } = gatewayReturning(detailResponse())
    const payment = await gateway.status({
      id: 'ORD-123',
      gateway: 'connectips',
    })
    expect(payment.status).toBe('completed')
    expect(payment.orderId).toBe('ORD-123')
    expect(payment.amount.amount).toBe(23000n)
    expect(calls[0]?.body).toMatchObject({ txnAmt: '0' })
  })

  it('maps a non-settling credit status to failed', async () => {
    const { gateway } = gatewayReturning(
      detailResponse({ creditStatus: '888' })
    )
    const payment = await gateway.status(
      { id: 'ORD-123', gateway: 'connectips' },
      { expected: ORDER }
    )
    expect(payment.status).toBe('failed')
  })

  it('seals unknown for an unknown transaction', async () => {
    const { gateway } = gatewayReturning({
      status: 'ERROR',
      statusDesc: 'TRANSACTION NOT FOUND',
    })
    const payment = await gateway.status(
      { id: 'ORD-123', gateway: 'connectips' },
      { expected: ORDER }
    )
    expect(payment.status).toBe('unknown')
    expect(payment.amount.amount).toBe(23000n)
  })

  it('rejects a malformed transaction id', async () => {
    const { gateway } = gatewayReturning(detailResponse())
    const error = await capture(() =>
      gateway.status({ id: 'bad id!', gateway: 'connectips' })
    )
    expect((error as NepalPaymentsError).code).toBe('INVALID_TXN_REF')
  })

  it('rejects a status lookup for another gateway', async () => {
    const { gateway } = gatewayReturning(detailResponse())
    const error = await capture(() =>
      gateway.status({ id: 'ORD-123', gateway: 'esewa' })
    )
    expect((error as NepalPaymentsError).code).toBe('GATEWAY_MISMATCH')
  })
})
