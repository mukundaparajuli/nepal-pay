import { describe, it, expect } from 'vitest'
import {
  VerificationError,
  isVerifiedPayment,
  moneyFromDecimal,
} from '@nepal-payments/core'
import type { TxnRef } from '@nepal-payments/core'
import statusNotFoundFixture from '../fixtures/esewa/status-not-found.json'
import statusCompleteFixture from '../fixtures/esewa/status-complete.json'
import {
  SANDBOX_PRODUCT_CODE,
  captureError,
  order,
  stubFetch,
  testGateway,
} from './helpers.js'

const txn = (id: string): TxnRef => ({ id, gateway: 'esewa' })

async function expectCode(
  fn: () => unknown | Promise<unknown>,
  code: string
): Promise<void> {
  const error = await captureError(fn)
  expect(error).toBeInstanceOf(VerificationError)
  expect((error as VerificationError).code).toBe(code)
}

describe('eSewa status', () => {
  it('confirms a completed transaction with an expected order', async () => {
    const { fetch, calls } = stubFetch(() => ({
      body: statusCompleteFixture,
    }))
    const gateway = testGateway({ fetch })
    const payment = await gateway.status(txn('240610-162413'), {
      expected: order({
        id: '240610-162413',
        amount: moneyFromDecimal('110.00'),
      }),
    })
    expect(isVerifiedPayment(payment)).toBe(true)
    expect(payment.status).toBe('completed')
    expect(payment.txnRef).toEqual({ id: '000AWEO', gateway: 'esewa' })
    expect(payment.amount.amount).toBe(11000n)
    expect(calls[0]).toContain('product_code=EPAYTEST')
    expect(calls[0]).toContain('total_amount=110.00')
    expect(calls[0]).toContain('transaction_uuid=240610-162413')
  })

  it('queries without an expected order using amount 0', async () => {
    const { fetch, calls } = stubFetch(() => ({
      body: statusNotFoundFixture,
    }))
    const gateway = testGateway({ fetch })
    const payment = await gateway.status(txn('unknown-txn'))
    expect(payment.status).toBe('unknown')
    expect(payment.orderId).toBe('unknown-txn')
    expect(payment.amount.amount).toBe(10000n)
    expect(payment.txnRef.id).toBe('unknown-txn')
    expect(calls[0]).toContain('total_amount=0')
  })

  it('rejects a status response whose amount does not match the expected order', async () => {
    const { fetch } = stubFetch(() => ({
      body: { ...statusCompleteFixture, total_amount: 99 },
    }))
    const gateway = testGateway({ fetch })
    await expectCode(
      () =>
        gateway.status(txn('240610-162413'), {
          expected: order({
            id: '240610-162413',
            amount: moneyFromDecimal('110.00'),
          }),
        }),
      'AMOUNT_MISMATCH'
    )
  })

  it('rejects a status response echoing another transaction_uuid', async () => {
    const { fetch } = stubFetch(() => ({
      body: { ...statusCompleteFixture, transaction_uuid: 'other' },
    }))
    const gateway = testGateway({ fetch })
    await expectCode(
      () =>
        gateway.status(txn('240610-162413'), {
          expected: order({
            id: '240610-162413',
            amount: moneyFromDecimal('110.00'),
          }),
        }),
      'ORDER_MISMATCH'
    )
  })

  it('rejects a status response with another product_code', async () => {
    const { fetch } = stubFetch(() => ({
      body: { ...statusCompleteFixture, product_code: 'OTHERCODE' },
    }))
    const gateway = testGateway({ fetch })
    await expectCode(
      () =>
        gateway.status(txn('240610-162413'), {
          expected: order({
            id: '240610-162413',
            amount: moneyFromDecimal('110.00'),
          }),
        }),
      'ORDER_MISMATCH'
    )
  })

  it('rejects a txnRef tagged with another gateway', async () => {
    const gateway = testGateway({
      fetch: () => Promise.reject(new Error('no')),
    })
    await expectCode(
      () => gateway.status({ id: 'abc', gateway: 'khalti' }),
      'GATEWAY_MISMATCH'
    )
  })

  it('rejects a transaction id outside the allowed charset', async () => {
    const gateway = testGateway({
      fetch: () => Promise.reject(new Error('no')),
    })
    await expectCode(() => gateway.status(txn('bad id!')), 'INVALID_TXN_REF')
  })

  it('rejects a non-2xx status response', async () => {
    const { fetch } = stubFetch(() => ({ status: 500, body: {} }))
    const gateway = testGateway({ fetch })
    await expectCode(
      () => gateway.status(txn('240610-162413')),
      'INVALID_STATUS'
    )
  })

  it('rejects a malformed JSON body', async () => {
    const { fetch } = stubFetch(() => ({ jsonThrows: true }))
    const gateway = testGateway({ fetch })
    const error = await captureError(() => gateway.status(txn('240610-162413')))
    expect(error).toBeInstanceOf(VerificationError)
  })

  it('rejects a payload missing required fields', async () => {
    const { fetch } = stubFetch(() => ({ body: { status: 'COMPLETE' } }))
    const gateway = testGateway({ fetch })
    await expectCode(
      () => gateway.status(txn('240610-162413')),
      'INVALID_STATUS'
    )
  })

  it('rejects a bare status query whose amount cannot be recovered', async () => {
    const { fetch } = stubFetch(() => ({
      body: { ...statusNotFoundFixture, total_amount: 0 },
    }))
    const gateway = testGateway({ fetch })
    await expectCode(() => gateway.status(txn('x')), 'INVALID_AMOUNT')
  })

  it('reports the sandbox product code on the status request', async () => {
    const { fetch, calls } = stubFetch(() => ({
      body: statusNotFoundFixture,
    }))
    const gateway = testGateway({ fetch })
    await gateway.status(txn('unknown-txn'))
    expect(calls[0]).toContain(`product_code=${SANDBOX_PRODUCT_CODE}`)
  })
})
