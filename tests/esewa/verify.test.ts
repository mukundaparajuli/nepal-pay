import { describe, it, expect } from 'vitest'
import {
  VerificationError,
  isVerifiedPayment,
  moneyFromDecimal,
} from '@nepal-payments/core'
import type { UnverifiedCallback } from '@nepal-payments/core'
import {
  SERVER_COMPLETE,
  SANDBOX_PRODUCT_CODE,
  b64,
  captureError,
  callbackData,
  makeCompleteCallback,
  order,
  serializeCallback,
  signCallbackPayload,
  stubFetch,
  testGateway,
  type CallbackInput,
} from './helpers.js'

async function expectCode(
  fn: () => unknown | Promise<unknown>,
  code: string
): Promise<void> {
  const error = await captureError(fn)
  expect(error).toBeInstanceOf(VerificationError)
  expect((error as VerificationError).code).toBe(code)
}

const PENDING_SFN =
  'status,total_amount,transaction_uuid,product_code,signed_field_names'

describe('eSewa verify', () => {
  it('verifies a signed COMPLETE callback after a server-side confirmation', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch, calls } = stubFetch(() => ({ body: SERVER_COMPLETE }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })

    const payment = await gateway.verify(callback, { expected: order() })

    expect(isVerifiedPayment(payment)).toBe(true)
    expect(payment.status).toBe('completed')
    expect(payment.orderId).toBe('ORD001')
    expect(payment.amount.amount).toBe(23000n)
    expect(payment.txnRef).toEqual({ id: '0004T5I', gateway: 'esewa' })
    expect(payment.raw?.status).toBe('COMPLETE')
    expect(payment.raw?.transaction_code).toBe('0004T5I')
    expect(payment.verifiedAt).toBeInstanceOf(Date)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('product_code=EPAYTEST')
    expect(calls[0]).toContain('total_amount=230.00')
    expect(calls[0]).toContain('transaction_uuid=ORD001')
  })

  it('preserves raw numeric literals when verifying (110.0)', async () => {
    const { data } = await makeCompleteCallback({
      total_amount: '110.0',
      transaction_uuid: '240610-162413',
      transaction_code: '000AWEO',
    })
    const { fetch } = stubFetch(() => ({
      body: {
        product_code: SANDBOX_PRODUCT_CODE,
        transaction_uuid: '240610-162413',
        total_amount: 110.0,
        status: 'COMPLETE',
        ref_id: '000AWEO',
      },
    }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    const payment = await gateway.verify(callback, {
      expected: order({
        id: '240610-162413',
        amount: moneyFromDecimal('110.00'),
      }),
    })
    expect(payment.status).toBe('completed')
    expect(payment.txnRef.id).toBe('000AWEO')
    expect(payment.amount.amount).toBe(11000n)
  })

  it('rejects a tampered amount', async () => {
    const { input } = await makeCompleteCallback()
    const tampered: CallbackInput = { ...input, total_amount: '999.00' }
    const gateway = testGateway()
    const callback = gateway.parseCallback({
      query: { data: callbackData(tampered) },
    })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'SIGNATURE_MISMATCH'
    )
  })

  it('rejects a tampered transaction_uuid', async () => {
    const { input } = await makeCompleteCallback()
    const tampered: CallbackInput = { ...input, transaction_uuid: 'ORD-HACK' }
    const gateway = testGateway()
    const callback = gateway.parseCallback({
      query: { data: callbackData(tampered) },
    })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'SIGNATURE_MISMATCH'
    )
  })

  it('rejects a validly signed amount that does not match the order', async () => {
    const { data } = await makeCompleteCallback({ total_amount: '200.00' })
    const { fetch, calls } = stubFetch(() => ({ body: SERVER_COMPLETE }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'AMOUNT_MISMATCH'
    )
    expect(calls).toHaveLength(0)
  })

  it('rejects a signed callback for another order', async () => {
    const { data } = await makeCompleteCallback({ transaction_uuid: 'OTHER1' })
    const gateway = testGateway({
      fetch: () => Promise.reject(new Error('no')),
    })
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'ORDER_MISMATCH'
    )
  })

  it('rejects a signed callback with another product code', async () => {
    const { data } = await makeCompleteCallback({ product_code: 'OTHERCODE' })
    const gateway = testGateway({
      fetch: () => Promise.reject(new Error('no')),
    })
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'ORDER_MISMATCH'
    )
  })

  it('rejects a callback tagged with another gateway', async () => {
    const { data } = await makeCompleteCallback()
    const gateway = testGateway()
    const parsed = gateway.parseCallback({ query: { data } })
    const callback: UnverifiedCallback = { ...parsed, gateway: 'khalti' }
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'GATEWAY_MISMATCH'
    )
  })

  it('rejects a signature made with the wrong secret', async () => {
    const { data } = await makeCompleteCallback()
    const gateway = testGateway({ secret: 'not-the-real-secret' })
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'SIGNATURE_MISMATCH'
    )
  })

  it('rejects a callback without a signature', async () => {
    const gateway = testGateway()
    const callback: UnverifiedCallback = {
      gateway: 'esewa',
      data: {
        status: 'COMPLETE',
        total_amount: 230,
        transaction_uuid: 'ORD001',
        product_code: SANDBOX_PRODUCT_CODE,
        signed_field_names:
          'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
      },
    }
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'SIGNATURE_MISMATCH'
    )
  })

  it('rejects an empty signed_field_names', async () => {
    const gateway = testGateway()
    const callback: UnverifiedCallback = {
      gateway: 'esewa',
      data: {
        status: 'COMPLETE',
        signature: 'abcd',
        total_amount: 230,
        transaction_uuid: 'ORD001',
        product_code: SANDBOX_PRODUCT_CODE,
        signed_field_names: '',
      },
    }
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'SIGNATURE_MISMATCH'
    )
  })

  it('seals a signed CANCELED callback without a status call', async () => {
    const input: CallbackInput = {
      status: 'CANCELED',
      total_amount: '230.00',
      transaction_uuid: 'ORD001',
      product_code: SANDBOX_PRODUCT_CODE,
      signed_field_names: PENDING_SFN,
    }
    const signed = await signCallbackPayload(input)
    const { fetch, calls } = stubFetch(() => ({ body: SERVER_COMPLETE }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({
      query: { data: callbackData(signed) },
    })
    const payment = await gateway.verify(callback, { expected: order() })
    expect(payment.status).toBe('canceled')
    expect(payment.txnRef.id).toBe('ORD001')
    expect(calls).toHaveLength(0)
  })

  it('seals a signed PENDING callback without a status call', async () => {
    const input: CallbackInput = {
      status: 'PENDING',
      total_amount: '230.00',
      transaction_uuid: 'ORD001',
      product_code: SANDBOX_PRODUCT_CODE,
      signed_field_names: PENDING_SFN,
    }
    const signed = await signCallbackPayload(input)
    const gateway = testGateway({
      fetch: () => Promise.reject(new Error('no')),
    })
    const callback = gateway.parseCallback({
      query: { data: callbackData(signed) },
    })
    const payment = await gateway.verify(callback, { expected: order() })
    expect(payment.status).toBe('pending')
  })

  it('maps an unknown signed status to unknown', async () => {
    const input: CallbackInput = {
      status: 'RECHECKING',
      total_amount: '230.00',
      transaction_uuid: 'ORD001',
      product_code: SANDBOX_PRODUCT_CODE,
      signed_field_names: PENDING_SFN,
    }
    const signed = await signCallbackPayload(input)
    const gateway = testGateway({
      fetch: () => Promise.reject(new Error('no')),
    })
    const callback = gateway.parseCallback({
      query: { data: callbackData(signed) },
    })
    const payment = await gateway.verify(callback, { expected: order() })
    expect(payment.status).toBe('unknown')
  })

  it('rejects a COMPLETE callback without a transaction_code', async () => {
    const input: CallbackInput = {
      status: 'COMPLETE',
      total_amount: '230.00',
      transaction_uuid: 'ORD001',
      product_code: SANDBOX_PRODUCT_CODE,
      signed_field_names: PENDING_SFN,
    }
    const signed = await signCallbackPayload(input)
    const { fetch, calls } = stubFetch(() => ({ body: SERVER_COMPLETE }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({
      query: { data: callbackData(signed) },
    })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'INVALID_TXN_REF'
    )
    expect(calls).toHaveLength(0)
  })

  it('rejects when the server reports NOT_FOUND for a COMPLETE callback', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({
      body: {
        ...SERVER_COMPLETE,
        status: 'NOT_FOUND',
        ref_id: null,
      },
    }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'UNKNOWN_TRANSACTION'
    )
  })

  it('rejects when the server disagrees with a COMPLETE callback', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({
      body: { ...SERVER_COMPLETE, status: 'PENDING' },
    }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'INVALID_STATUS'
    )
  })

  it('rejects when the server amount differs', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({
      body: { ...SERVER_COMPLETE, total_amount: 100 },
    }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'AMOUNT_MISMATCH'
    )
  })

  it('rejects when the server echoes another transaction_uuid', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({
      body: { ...SERVER_COMPLETE, transaction_uuid: 'SOMETHING-ELSE' },
    }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'ORDER_MISMATCH'
    )
  })

  it('rejects when the server echoes another product_code', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({
      body: { ...SERVER_COMPLETE, product_code: 'OTHERCODE' },
    }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'ORDER_MISMATCH'
    )
  })

  it('rejects when ref_id does not match transaction_code', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({
      body: { ...SERVER_COMPLETE, ref_id: 'DIFFERENT' },
    }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'UNKNOWN_TRANSACTION'
    )
  })

  it('propagates a status endpoint transport failure', async () => {
    const { data } = await makeCompleteCallback()
    const gateway = testGateway({
      fetch: () => Promise.reject(new Error('connection reset')),
    })
    const callback = gateway.parseCallback({ query: { data } })
    const error = await captureError(() =>
      gateway.verify(callback, { expected: order() })
    )
    expect((error as Error).message).toBe('connection reset')
  })

  it('rejects a malformed status payload', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({ body: { status: 'COMPLETE' } }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'INVALID_STATUS'
    )
  })

  it('rejects a status response that is not an object', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({ body: null }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'INVALID_STATUS'
    )
  })

  it('rejects a status response whose JSON body cannot be parsed', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({ jsonThrows: true }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    const error = await captureError(() =>
      gateway.verify(callback, { expected: order() })
    )
    expect(error).toBeInstanceOf(VerificationError)
  })

  it('rejects a non-2xx status response', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({ status: 503, body: {} }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'INVALID_STATUS'
    )
  })

  it('verifies the published fixture structure once re-signed', async () => {
    const { data } = await makeCompleteCallback({
      transaction_uuid: '12-6-23',
      total_amount: '230',
    })
    const { fetch } = stubFetch(() => ({
      body: {
        product_code: SANDBOX_PRODUCT_CODE,
        transaction_uuid: '12-6-23',
        total_amount: 230,
        status: 'COMPLETE',
        ref_id: '0004T5I',
      },
    }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    const payment = await gateway.verify(callback, {
      expected: order({ id: '12-6-23', amount: moneyFromDecimal('230.00') }),
    })
    expect(payment.status).toBe('completed')
    expect(payment.txnRef.id).toBe('0004T5I')
  })

  it('rejects an unsigned callback handed straight to verify', async () => {
    const gateway = testGateway()
    const callback: UnverifiedCallback = {
      gateway: 'esewa',
      data: {},
    }
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'SIGNATURE_MISMATCH'
    )
  })

  it('accepts the data parameter built without the parser (re-serialized)', async () => {
    const { input } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({ body: SERVER_COMPLETE }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({
      query: { data: b64(serializeCallback(input)) },
    })
    const payment = await gateway.verify(callback, { expected: order() })
    expect(payment.status).toBe('completed')
  })
})
