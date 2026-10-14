import { describe, it, expect } from 'vitest'
import {
  isVerifiedPayment,
  moneyEquals,
  NepalPaymentsError,
  type VerifiedPayment,
} from '@nepal-payments/core'
import { stubRequest } from '../khalti/helpers.js'
import {
  order,
  responseFields,
  signedCallback,
  testGateway,
} from './helpers.js'

const EXPECTED = order()

async function capture(fn: () => unknown): Promise<unknown> {
  try {
    return await fn()
  } catch (error) {
    return error
  }
}

function gatewayReturning(text: string, status = 200) {
  const { fetch, calls } = stubRequest(() => ({ text, status }))
  return { gateway: testGateway({ fetch }), calls }
}

describe('verifyFonepayPayment', () => {
  it('seals a completed payment with the expected amount', async () => {
    const { gateway } = gatewayReturning('success')
    const raw = await signedCallback()
    const payment = await gateway.verify(gateway.parseCallback(raw), {
      expected: EXPECTED,
    })
    expect(isVerifiedPayment(payment)).toBe(true)
    expect(payment.status).toBe('completed')
    expect(payment.orderId).toBe(EXPECTED.id)
    expect(payment.txnRef).toEqual({ id: 'ORD-123', gateway: 'fonepay' })
    expect(moneyEquals(payment.amount, EXPECTED.amount)).toBe(true)
  })

  it('rejects an amount mismatch with AMOUNT_MISMATCH', async () => {
    const { gateway } = gatewayReturning('success')
    const raw = await signedCallback({ P_AMT: '9999.00' })
    const error = await capture(() =>
      gateway.verify(gateway.parseCallback(raw), { expected: EXPECTED })
    )
    expect(error).toBeInstanceOf(NepalPaymentsError)
    expect((error as NepalPaymentsError).code).toBe('AMOUNT_MISMATCH')
  })

  it('rejects an order mismatch with ORDER_MISMATCH', async () => {
    const { gateway } = gatewayReturning('success')
    const raw = await signedCallback({ PRN: 'ORD-999' })
    const error = await capture(() =>
      gateway.verify(gateway.parseCallback(raw), { expected: EXPECTED })
    )
    expect((error as NepalPaymentsError).code).toBe('ORDER_MISMATCH')
  })

  it('rejects a merchant code mismatch with ORDER_MISMATCH', async () => {
    const { gateway } = gatewayReturning('success')
    const raw = await signedCallback({ PID: '9999999999' })
    const error = await capture(() =>
      gateway.verify(gateway.parseCallback(raw), { expected: EXPECTED })
    )
    expect((error as NepalPaymentsError).code).toBe('ORDER_MISMATCH')
  })

  it('rejects a broken signature with SIGNATURE_MISMATCH', async () => {
    const { gateway } = gatewayReturning('success')
    const raw = await signedCallback({}, 'wrong-secret')
    const error = await capture(() =>
      gateway.verify(gateway.parseCallback(raw), { expected: EXPECTED })
    )
    expect((error as NepalPaymentsError).code).toBe('SIGNATURE_MISMATCH')
  })

  it('rejects a callback for another gateway', async () => {
    const { gateway } = gatewayReturning('success')
    const raw = await signedCallback()
    const parsed = gateway.parseCallback(raw)
    const error = await capture(() =>
      gateway.verify({ ...parsed, gateway: 'esewa' }, { expected: EXPECTED })
    )
    expect((error as NepalPaymentsError).code).toBe('GATEWAY_MISMATCH')
  })

  it('rejects a callback missing PRN', async () => {
    const { gateway } = gatewayReturning('success')
    const { PRN, ...rest } = responseFields()
    expect(PRN).toBe('ORD-123')
    const error = await capture(() =>
      gateway.verify(
        { gateway: 'fonepay', data: { ...rest, DV: 'z' } },
        { expected: EXPECTED }
      )
    )
    expect((error as NepalPaymentsError).code).toBe('MALFORMED_CALLBACK')
  })

  it('rejects a callback missing DV', async () => {
    const { gateway } = gatewayReturning('success')
    const error = await capture(() =>
      gateway.verify(
        { gateway: 'fonepay', data: { ...responseFields() } },
        { expected: EXPECTED }
      )
    )
    expect((error as NepalPaymentsError).code).toBe('MALFORMED_CALLBACK')
  })

  it('seals failed for a failed response code', async () => {
    const { gateway } = gatewayReturning('failure')
    const raw = await signedCallback({
      RC: 'failed',
      PS: 'false',
      P_AMT: '0.00',
    })
    const payment = (await gateway.verify(gateway.parseCallback(raw), {
      expected: EXPECTED,
    })) as VerifiedPayment
    expect(payment.status).toBe('failed')
  })

  it('seals canceled for a cancel response code', async () => {
    const { gateway } = gatewayReturning('failure')
    const raw = await signedCallback({
      RC: 'cancel',
      PS: 'false',
      P_AMT: '0.00',
    })
    const payment = (await gateway.verify(gateway.parseCallback(raw), {
      expected: EXPECTED,
    })) as VerifiedPayment
    expect(payment.status).toBe('canceled')
  })

  it('downgrades a completed claim when verification disagrees', async () => {
    const { gateway } = gatewayReturning('failure')
    const raw = await signedCallback()
    const payment = (await gateway.verify(gateway.parseCallback(raw), {
      expected: EXPECTED,
    })) as VerifiedPayment
    expect(payment.status).toBe('failed')
  })

  it('skips server verification when disabled', async () => {
    const { fetch, calls } = stubRequest(() => ({ text: 'failure' }))
    const gateway = testGateway({ fetch, serverVerification: false })
    const raw = await signedCallback()
    const payment = (await gateway.verify(gateway.parseCallback(raw), {
      expected: EXPECTED,
    })) as VerifiedPayment
    expect(payment.status).toBe('completed')
    expect(calls).toHaveLength(0)
  })

  it('raises INVALID_STATUS when the verification endpoint errors', async () => {
    const { gateway } = gatewayReturning('server error', 500)
    const raw = await signedCallback()
    const error = await capture(() =>
      gateway.verify(gateway.parseCallback(raw), { expected: EXPECTED })
    )
    expect((error as NepalPaymentsError).code).toBe('INVALID_STATUS')
  })
})
