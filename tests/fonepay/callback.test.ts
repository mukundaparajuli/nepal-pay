import { describe, it, expect } from 'vitest'
import { PaymentError, type RawCallbackRequest } from '@nepal-payments/core'
import { createFonepay, parseFonepayCallback } from '@nepal-payments/fonepay'
import {
  FONEPAY_MERCHANT_CODE,
  FONEPAY_SECRET,
  responseFields,
  signedCallback,
} from './helpers.js'

function gateway() {
  return createFonepay({
    merchantCode: FONEPAY_MERCHANT_CODE,
    secretKey: FONEPAY_SECRET,
    environment: 'sandbox',
  })
}

function capture(fn: () => unknown): unknown {
  try {
    return fn()
  } catch (error) {
    return error
  }
}

describe('parseFonepayCallback', () => {
  it('parses a query callback into the payload', async () => {
    const raw = await signedCallback()
    const callback = parseFonepayCallback(raw)
    expect(callback.gateway).toBe('fonepay')
    expect(callback.data.PRN).toBe('ORD-123')
    expect(callback.data.RC).toBe('successful')
    expect(callback.data.DV).toBeDefined()
  })

  it('parses a form-encoded body', () => {
    const fields = responseFields()
    const body = new URLSearchParams({
      ...fields,
      DV: 'x'.repeat(128),
    }).toString()
    const callback = parseFonepayCallback({ body })
    expect(callback.data.PRN).toBe('ORD-123')
    expect(callback.data.RC).toBe('successful')
  })

  it('prefers query values over body values', () => {
    const body = new URLSearchParams({
      ...responseFields(),
      DV: 'x',
    }).toString()
    const callback = parseFonepayCallback({
      body,
      query: { ...responseFields({ PRN: 'ORD-QUERY' }), DV: 'y' },
    })
    expect(callback.data.PRN).toBe('ORD-QUERY')
  })

  it('is reachable through the gateway adapter', () => {
    const callback = gateway().parseCallback({
      query: { ...responseFields(), DV: 'z' },
    })
    expect(callback.gateway).toBe('fonepay')
  })

  it('rejects an empty request as MALFORMED_CALLBACK', () => {
    const error = capture(() => parseFonepayCallback({}))
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })

  it('rejects a missing required field', () => {
    const { DV, ...rest } = { ...responseFields(), DV: 'z' }
    const request: RawCallbackRequest = { query: { ...rest } }
    expect(DV).toBe('z')
    const error = capture(() => parseFonepayCallback(request))
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })

  it('rejects a malformed PRN', () => {
    const error = capture(() =>
      parseFonepayCallback({
        query: { ...responseFields({ PRN: 'bad id!' }), DV: 'z' },
      })
    )
    expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
  })
})
