import { describe, it, expect } from 'vitest'
import {
  VerificationError,
  callbackFingerprint,
  isVerifiedPayment,
} from '@nepal-payments/core'
import type { UnverifiedCallback } from '@nepal-payments/core'
import {
  SERVER_COMPLETE,
  SANDBOX_SECRET,
  captureError,
  callbackData,
  makeCompleteCallback,
  order,
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

describe('eSewa security audit', () => {
  it('rejects a modified amount', async () => {
    const { input } = await makeCompleteCallback()
    const tampered: CallbackInput = { ...input, total_amount: '1.00' }
    const gateway = testGateway()
    const callback = gateway.parseCallback({
      query: { data: callbackData(tampered) },
    })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'SIGNATURE_MISMATCH'
    )
  })

  it('rejects a modified transaction uuid', async () => {
    const { input } = await makeCompleteCallback()
    const tampered: CallbackInput = { ...input, transaction_uuid: 'ORD-EVIL' }
    const gateway = testGateway()
    const callback = gateway.parseCallback({
      query: { data: callbackData(tampered) },
    })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'SIGNATURE_MISMATCH'
    )
  })

  it('rejects a modified product code', async () => {
    const { input } = await makeCompleteCallback()
    const tampered: CallbackInput = { ...input, product_code: 'EVILCODE' }
    const gateway = testGateway()
    const callback = gateway.parseCallback({
      query: { data: callbackData(tampered) },
    })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'SIGNATURE_MISMATCH'
    )
  })

  it('rejects a modified status', async () => {
    const { input } = await makeCompleteCallback()
    const tampered: CallbackInput = { ...input, status: 'PENDING' }
    const gateway = testGateway({
      fetch: () => Promise.reject(new Error('no')),
    })
    const callback = gateway.parseCallback({
      query: { data: callbackData(tampered) },
    })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'SIGNATURE_MISMATCH'
    )
  })

  it('rejects a modified signature', async () => {
    const { input } = await makeCompleteCallback()
    const signature = String(input.signature)
    const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1)
    const tampered: CallbackInput = { ...input, signature: flipped }
    const gateway = testGateway()
    const callback = gateway.parseCallback({
      query: { data: callbackData(tampered) },
    })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'SIGNATURE_MISMATCH'
    )
  })

  it('rejects a missing signature', async () => {
    const gateway = testGateway()
    const callback: UnverifiedCallback = {
      gateway: 'esewa',
      data: {
        status: 'COMPLETE',
        total_amount: 230,
        transaction_uuid: 'ORD001',
        product_code: 'EPAYTEST',
        signed_field_names:
          'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
      },
    }
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'SIGNATURE_MISMATCH'
    )
  })

  it('treats replayed callbacks as deterministic (no nonce field exists)', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({ body: SERVER_COMPLETE }))
    const gateway = testGateway({ fetch })

    const first = gateway.parseCallback({ query: { data } })
    const second = gateway.parseCallback({ query: { data } })
    expect(await callbackFingerprint(first)).toBe(
      await callbackFingerprint(second)
    )

    const paymentOne = await gateway.verify(first, { expected: order() })
    const paymentTwo = await gateway.verify(second, { expected: order() })
    expect(paymentOne.txnRef.id).toBe(paymentTwo.txnRef.id)
    expect(paymentOne.status).toBe('completed')
    expect(paymentTwo.status).toBe('completed')
    expect(isVerifiedPayment(paymentOne)).toBe(true)
  })

  it('rejects a signature produced with a different secret', async () => {
    const { data } = await makeCompleteCallback({}, 'some-other-secret')
    const gateway = testGateway()
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'SIGNATURE_MISMATCH'
    )
  })

  it('never includes the secret in error messages', async () => {
    const secret = 'super-secret-key-do-not-leak'
    const { data } = await makeCompleteCallback({}, 'other-secret')
    const gateway = testGateway({ secret })
    const callback = gateway.parseCallback({ query: { data } })
    const error = await captureError(() =>
      gateway.verify(callback, { expected: order() })
    )
    expect(String(error)).not.toContain(secret)
    expect(
      String((error as { details?: unknown }).details ?? '')
    ).not.toContain(secret)
  })

  it('rejects a COMPLETE callback the status API does not know', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({
      body: {
        product_code: 'EPAYTEST',
        transaction_uuid: 'ORD001',
        total_amount: 230,
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

  it('rejects a malformed status response', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({ body: '<html>oops</html>' }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    await expectCode(
      () => gateway.verify(callback, { expected: order() }),
      'INVALID_STATUS'
    )
  })

  it('rejects a status response that is not JSON', async () => {
    const { data } = await makeCompleteCallback()
    const { fetch } = stubFetch(() => ({ jsonThrows: true }))
    const gateway = testGateway({ fetch })
    const callback = gateway.parseCallback({ query: { data } })
    const error = await captureError(() =>
      gateway.verify(callback, { expected: order() })
    )
    expect(error).toBeInstanceOf(VerificationError)
  })

  it('times out instead of hanging on a stalled status endpoint', async () => {
    const { data } = await makeCompleteCallback()
    const hangingFetch = ((_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'))
        })
      })) as unknown as typeof globalThis.fetch
    const gateway = testGateway({ fetch: hangingFetch, timeoutMs: 25 })
    const callback = gateway.parseCallback({ query: { data } })
    const error = await captureError(() =>
      gateway.verify(callback, { expected: order() })
    )
    expect(error).toBeDefined()
    expect((error as Error).name).toBe('AbortError')
    expect(isVerifiedPayment(error)).toBe(false)
  })

  it('rejects a forged callback with no valid signature fields at all', async () => {
    const gateway = testGateway({
      fetch: () => Promise.reject(new Error('no')),
    })
    const forged: UnverifiedCallback = {
      gateway: 'esewa',
      data: {
        status: 'COMPLETE',
        signature: 'forged-signature-value==',
        total_amount: 230,
        transaction_uuid: 'ORD001',
        product_code: 'EPAYTEST',
        signed_field_names:
          'status,total_amount,transaction_uuid,product_code,signed_field_names',
      },
    }
    await expectCode(
      () => gateway.verify(forged, { expected: order() }),
      'SIGNATURE_MISMATCH'
    )
    expect(SANDBOX_SECRET).not.toBe('forged-signature-value==')
  })

  it('never seals anything when verification fails', async () => {
    const { input } = await makeCompleteCallback()
    const tampered: CallbackInput = { ...input, total_amount: '0.01' }
    const gateway = testGateway()
    const callback = gateway.parseCallback({
      query: { data: callbackData(tampered) },
    })
    const error = await captureError(() =>
      gateway.verify(callback, { expected: order() })
    )
    expect(isVerifiedPayment(error)).toBe(false)
  })
})
