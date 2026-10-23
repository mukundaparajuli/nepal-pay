import { describe, it, expect } from 'vitest'
import { isVerifiedPayment, moneyEquals, NepalPayError } from '@nepal-pay/core'
import {
  checkFonepayStatus,
  mapFonepayResponseCode,
  mapFonepayVerification,
} from '@nepal-pay/fonepay'
import { stubRequest } from '../khalti/helpers.js'
import { order, testGateway } from './helpers.js'

const EXPECTED = order()

async function capture(fn: () => unknown): Promise<unknown> {
  try {
    return await fn()
  } catch (error) {
    return error
  }
}

function gatewayReturning(text: string) {
  const { fetch, calls } = stubRequest(() => ({ text }))
  return { gateway: testGateway({ fetch }), calls }
}

describe('mapFonepayVerification', () => {
  it('maps the documented responses', () => {
    expect(mapFonepayVerification('success')).toBe('completed')
    expect(mapFonepayVerification('Success')).toBe('completed')
    expect(mapFonepayVerification('failure')).toBe('failed')
    expect(mapFonepayVerification('failed')).toBe('failed')
    expect(mapFonepayVerification('error')).toBe('unknown')
    expect(mapFonepayVerification('')).toBe('unknown')
    expect(mapFonepayVerification(undefined)).toBe('unknown')
    expect(mapFonepayVerification(42)).toBe('unknown')
  })
})

describe('mapFonepayResponseCode', () => {
  it('maps response codes and the status flag', () => {
    expect(mapFonepayResponseCode('successful', 'true')).toBe('completed')
    expect(mapFonepayResponseCode('successful', 'false')).toBe('failed')
    expect(mapFonepayResponseCode('failed', 'false')).toBe('failed')
    expect(mapFonepayResponseCode('cancel', 'false')).toBe('canceled')
    expect(mapFonepayResponseCode(undefined, 'true')).toBe('completed')
    expect(mapFonepayResponseCode(undefined, 'false')).toBe('failed')
    expect(mapFonepayResponseCode('weird', 'maybe')).toBe('unknown')
    expect(mapFonepayResponseCode(undefined, undefined)).toBe('unknown')
  })
})

describe('checkFonepayStatus', () => {
  it('seals completed when verification reports success', async () => {
    const { gateway, calls } = gatewayReturning('success')
    const payment = await checkFonepayStatus(
      gateway.config,
      { id: 'ORD-123', gateway: 'fonepay' },
      { expected: EXPECTED }
    )
    expect(isVerifiedPayment(payment)).toBe(true)
    expect(payment.status).toBe('completed')
    expect(payment.orderId).toBe(EXPECTED.id)
    expect(moneyEquals(payment.amount, EXPECTED.amount)).toBe(true)
    expect(calls).toHaveLength(1)
    const url = new URL(calls[0]?.url ?? '')
    expect(url.pathname).toContain('/verificationMerchant')
    expect(url.searchParams.get('PRN')).toBe('ORD-123')
    expect(url.searchParams.get('AMT')).toBe('230.00')
  })

  it('seals unknown when verification is inconclusive', async () => {
    const { gateway } = gatewayReturning('no such transaction')
    const payment = await checkFonepayStatus(
      gateway.config,
      { id: 'ORD-123', gateway: 'fonepay' },
      { expected: EXPECTED }
    )
    expect(payment.status).toBe('unknown')
  })

  it('rejects a status lookup for another gateway', async () => {
    const { gateway } = gatewayReturning('success')
    const error = await capture(() =>
      checkFonepayStatus(gateway.config, { id: 'ORD-123', gateway: 'esewa' })
    )
    expect((error as NepalPayError).code).toBe('GATEWAY_MISMATCH')
  })

  it('rejects a malformed PRN', async () => {
    const { gateway } = gatewayReturning('success')
    const error = await capture(() =>
      checkFonepayStatus(gateway.config, { id: 'bad id!', gateway: 'fonepay' })
    )
    expect((error as NepalPayError).code).toBe('INVALID_TXN_REF')
  })

  it('requires an expected order to supply the amount', async () => {
    const { gateway } = gatewayReturning('success')
    const error = await capture(() =>
      checkFonepayStatus(gateway.config, { id: 'ORD-123', gateway: 'fonepay' })
    )
    expect((error as NepalPayError).code).toBe('INVALID_AMOUNT')
  })
})
