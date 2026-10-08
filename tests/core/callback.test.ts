import { describe, it, expect } from 'vitest'
import { callbackFingerprint } from '@nepal-payments/core'
import type { UnverifiedCallback } from '@nepal-payments/core'

describe('callbackFingerprint', () => {
  it('is stable across data key order', async () => {
    const first: UnverifiedCallback = {
      gateway: 'esewa',
      data: { amt: '100.00', refId: '77' },
    }
    const second: UnverifiedCallback = {
      gateway: 'esewa',
      data: { refId: '77', amt: '100.00' },
    }
    expect(await callbackFingerprint(first)).toBe(
      await callbackFingerprint(second)
    )
  })

  it('changes when the data changes', async () => {
    const first: UnverifiedCallback = {
      gateway: 'esewa',
      data: { amt: '100.00' },
    }
    const second: UnverifiedCallback = {
      gateway: 'esewa',
      data: { amt: '999.00' },
    }
    expect(await callbackFingerprint(first)).not.toBe(
      await callbackFingerprint(second)
    )
  })

  it('changes when the gateway changes', async () => {
    const first: UnverifiedCallback = {
      gateway: 'esewa',
      data: { amt: '100.00' },
    }
    const second: UnverifiedCallback = {
      gateway: 'khalti',
      data: { amt: '100.00' },
    }
    expect(await callbackFingerprint(first)).not.toBe(
      await callbackFingerprint(second)
    )
  })

  it('distinguishes absent and present headers', async () => {
    const base: UnverifiedCallback = { gateway: 'khalti', data: {} }
    const withHeaders: UnverifiedCallback = {
      gateway: 'khalti',
      data: {},
      headers: {},
    }
    expect(await callbackFingerprint(base)).not.toBe(
      await callbackFingerprint(withHeaders)
    )
  })

  it('treats an undefined body like an absent body', async () => {
    const withoutBody: UnverifiedCallback = { gateway: 'esewa', data: {} }
    const undefinedBody: UnverifiedCallback = {
      gateway: 'esewa',
      data: {},
      body: undefined,
    }
    expect(await callbackFingerprint(withoutBody)).toBe(
      await callbackFingerprint(undefinedBody)
    )
  })

  it('produces a hex sha256 digest', async () => {
    expect(await callbackFingerprint({ gateway: 'esewa', data: {} })).toMatch(
      /^[0-9a-f]{64}$/
    )
  })
})

describe('UnverifiedCallback typing', () => {
  it('rejects gateways outside the supported set', () => {
    const callback: UnverifiedCallback = {
      // @ts-expect-error only supported gateways are allowed
      gateway: 'mock-gateway',
      data: {},
    }
    expect(callback.gateway).toBe('mock-gateway')
  })

  it('accepts a raw string body', () => {
    const callback: UnverifiedCallback = {
      gateway: 'fonepay',
      data: {},
      body: 'raw=body',
    }
    expect(callback.body).toBe('raw=body')
  })
})
