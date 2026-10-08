import { describe, it, expect } from 'vitest'
import { ConfigurationError } from '@nepal-payments/core'
import { createKhalti } from '@nepal-payments/khalti'
import {
  PROD_INITIATE_URL,
  PROD_LOOKUP_URL,
  SANDBOX_INITIATE_URL,
  SANDBOX_LOOKUP_URL,
  SANDBOX_SECRET,
  testGateway,
} from './helpers.js'

describe('khalti config', () => {
  it('resolves the sandbox endpoint defaults', () => {
    const gateway = testGateway()
    expect(gateway.config.initiateUrl).toBe(SANDBOX_INITIATE_URL)
    expect(gateway.config.lookupUrl).toBe(SANDBOX_LOOKUP_URL)
  })

  it('resolves the production endpoint defaults', () => {
    const gateway = testGateway({ environment: 'production' })
    expect(gateway.config.initiateUrl).toBe(PROD_INITIATE_URL)
    expect(gateway.config.lookupUrl).toBe(PROD_LOOKUP_URL)
  })

  it('requires a secret key', () => {
    for (const secretKey of [undefined, '']) {
      expect(() =>
        createKhalti({
          secretKey: secretKey as unknown as string,
          environment: 'sandbox',
        })
      ).toThrow(ConfigurationError)
    }
  })

  it('rejects unsupported environments', () => {
    expect(() =>
      createKhalti({
        secretKey: SANDBOX_SECRET,
        environment: 'live' as never,
      })
    ).toThrow(ConfigurationError)
  })

  it('rejects invalid URL overrides', () => {
    for (const name of [
      'returnUrl',
      'websiteUrl',
      'initiateUrl',
      'lookupUrl',
    ]) {
      expect(() => testGateway({ [name]: 'not-a-url' } as never)).toThrow(
        ConfigurationError
      )
    }
  })

  it('rejects non-positive timeoutMs', () => {
    for (const timeoutMs of [0, -1, 1.5, NaN, '10'] as unknown as number[]) {
      expect(() => testGateway({ timeoutMs })).toThrow(ConfigurationError)
    }
  })

  it('applies URL and timeout overrides', () => {
    const gateway = testGateway({
      initiateUrl: 'https://proxy.example/initiate',
      lookupUrl: 'https://proxy.example/lookup',
      timeoutMs: 250,
    })
    expect(gateway.config.initiateUrl).toBe('https://proxy.example/initiate')
    expect(gateway.config.lookupUrl).toBe('https://proxy.example/lookup')
    expect(gateway.config.timeoutMs).toBe(250)
  })

  it('defaults the timeout to 10 seconds', () => {
    expect(testGateway().config.timeoutMs).toBe(10_000)
  })

  it('defaults fetch to the global fetch', () => {
    expect(testGateway().config.fetch).toBe(globalThis.fetch)
  })

  it('uses an injected fetch', () => {
    const fetch = (() => undefined) as unknown as typeof globalThis.fetch
    expect(testGateway({ fetch }).config.fetch).toBe(fetch)
  })
})
