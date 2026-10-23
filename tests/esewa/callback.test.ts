import { describe, it, expect } from 'vitest'
import { PaymentError, isVerifiedPayment } from '@nepal-pay/core'
import {
  CALLBACK_SFN,
  b64,
  b64url,
  captureError,
  makeCompleteCallback,
  testGateway,
} from './helpers.js'

describe('eSewa callback parsing', () => {
  it('decodes the base64 data parameter into an UnverifiedCallback', async () => {
    const { input, data } = await makeCompleteCallback()
    const callback = testGateway().parseCallback({ query: { data } })
    expect(callback.gateway).toBe('esewa')
    expect(callback.data.status).toBe('COMPLETE')
    expect(callback.data.transaction_code).toBe('0004T5I')
    expect(callback.data.total_amount).toBe(230)
    expect(callback.data.signed_field_names).toBe(CALLBACK_SFN)
    expect(callback.body).toBe(Buffer.from(data, 'base64').toString('utf8'))
    expect(input.signature).toEqual(expect.any(String))
  })

  it('never produces a VerifiedPayment', async () => {
    const { data } = await makeCompleteCallback()
    const callback = testGateway().parseCallback({ query: { data } })
    expect(isVerifiedPayment(callback)).toBe(false)
  })

  it('accepts data from a POST body', async () => {
    const { data } = await makeCompleteCallback()
    const callback = testGateway().parseCallback({ body: { data } })
    expect(callback.gateway).toBe('esewa')
    expect(callback.data.status).toBe('COMPLETE')
  })

  it('tolerates url-safe base64', async () => {
    const { input } = await makeCompleteCallback()
    const json = JSON.stringify(input)
    const data = b64url(json)
    const callback = testGateway().parseCallback({ query: { data } })
    expect(callback.data.status).toBe('COMPLETE')
  })

  it('preserves raw numeric literals in the decoded body', async () => {
    const { data, json } = await makeCompleteCallback({
      total_amount: '110.0',
    })
    const callback = testGateway().parseCallback({ query: { data } })
    expect(callback.body).toContain('"total_amount":110.0')
    expect(callback.body).toBe(json)
    expect(callback.data.total_amount).toBe(110)
  })

  it('keeps headers on the callback', async () => {
    const { data } = await makeCompleteCallback()
    const callback = testGateway().parseCallback({
      query: { data },
      headers: { 'user-agent': 'test' },
    })
    expect(callback.headers).toEqual({ 'user-agent': 'test' })
  })

  it('rejects a missing data parameter', async () => {
    const error = await captureError(() =>
      testGateway().parseCallback({ query: {} })
    )
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })

  it('rejects a non-string data parameter', async () => {
    const error = await captureError(() =>
      testGateway().parseCallback({ query: { data: 42 } })
    )
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })

  it('rejects invalid base64', async () => {
    const error = await captureError(() =>
      testGateway().parseCallback({ query: { data: '!!!not-base64!!!' } })
    )
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })

  it('rejects base64 that is not JSON', async () => {
    const error = await captureError(() =>
      testGateway().parseCallback({ query: { data: b64('plain text') } })
    )
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })

  it('rejects JSON that is not an object', async () => {
    const error = await captureError(() =>
      testGateway().parseCallback({ query: { data: b64('"just a string"') } })
    )
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })

  it('rejects a payload missing any required field', async () => {
    const fields = [
      'status',
      'signature',
      'total_amount',
      'transaction_uuid',
      'product_code',
      'signed_field_names',
    ] as const
    for (const field of fields) {
      const { input } = await makeCompleteCallback()
      const damaged: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(input)) {
        if (key !== field) damaged[key] = value
      }
      const error = await captureError(() =>
        testGateway().parseCallback({
          query: { data: b64(JSON.stringify(damaged)) },
        })
      )
      expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
      expect((error as PaymentError).message).toContain(field)
    }
  })

  it('rejects a body without a data field', async () => {
    const error = await captureError(() =>
      testGateway().parseCallback({ body: { foo: 'bar' } })
    )
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })
})
