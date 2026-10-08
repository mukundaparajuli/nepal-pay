import { describe, it, expect } from 'vitest'
import { ConfigurationError } from '@nepal-payments/core'
import { createEsewa, EsewaGateway } from '@nepal-payments/esewa'
import { SANDBOX_PRODUCT_CODE, SANDBOX_SECRET, testGateway } from './helpers.js'

describe('createEsewa configuration', () => {
  it('creates a gateway with sandbox defaults', () => {
    const gateway = createEsewa({
      merchantCode: SANDBOX_PRODUCT_CODE,
      secret: SANDBOX_SECRET,
      environment: 'sandbox',
    })
    expect(gateway).toBeInstanceOf(EsewaGateway)
    expect(gateway.name).toBe('esewa')
    expect(gateway.config.checkoutFormUrl).toBe(
      'https://rc-epay.esewa.com.np/api/epay/main/v2/form'
    )
    expect(gateway.config.statusCheckUrl).toBe(
      'https://rc-epay.esewa.com.np/api/epay/transaction/status/'
    )
  })

  it('uses production endpoints for the production environment', () => {
    const gateway = createEsewa({
      merchantCode: SANDBOX_PRODUCT_CODE,
      secret: SANDBOX_SECRET,
      environment: 'production',
    })
    expect(gateway.config.checkoutFormUrl).toBe(
      'https://epay.esewa.com.np/api/epay/main/v2/form'
    )
    expect(gateway.config.statusCheckUrl).toBe(
      'https://epay.esewa.com.np/api/epay/transaction/status/'
    )
  })

  it('honours endpoint overrides', () => {
    const gateway = createEsewa({
      merchantCode: SANDBOX_PRODUCT_CODE,
      secret: SANDBOX_SECRET,
      environment: 'sandbox',
      checkoutFormUrl: 'https://override.example/form',
      statusCheckUrl: 'https://override.example/status',
    })
    expect(gateway.config.checkoutFormUrl).toBe('https://override.example/form')
    expect(gateway.config.statusCheckUrl).toBe(
      'https://override.example/status'
    )
  })

  it('defaults the timeout', () => {
    expect(testGateway().config.timeoutMs).toBe(10_000)
    expect(testGateway({ timeoutMs: 5_000 }).config.timeoutMs).toBe(5_000)
  })

  it('rejects a missing merchant code', () => {
    expect(() =>
      createEsewa({
        merchantCode: '',
        secret: SANDBOX_SECRET,
        environment: 'sandbox',
      })
    ).toThrow(ConfigurationError)
  })

  it('rejects a missing secret', () => {
    expect(() =>
      createEsewa({
        merchantCode: SANDBOX_PRODUCT_CODE,
        secret: '',
        environment: 'sandbox',
      })
    ).toThrow(ConfigurationError)
  })

  it('rejects an unsupported environment', () => {
    expect(() =>
      createEsewa({
        merchantCode: SANDBOX_PRODUCT_CODE,
        secret: SANDBOX_SECRET,
        environment: 'staging' as 'sandbox',
      })
    ).toThrow(ConfigurationError)
  })

  it('rejects invalid URLs', () => {
    expect(() =>
      createEsewa({
        merchantCode: SANDBOX_PRODUCT_CODE,
        secret: SANDBOX_SECRET,
        environment: 'sandbox',
        successUrl: 'not-a-url',
      })
    ).toThrow(ConfigurationError)
    expect(() =>
      createEsewa({
        merchantCode: SANDBOX_PRODUCT_CODE,
        secret: SANDBOX_SECRET,
        environment: 'sandbox',
        statusCheckUrl: 'ftp://example.com/status',
      })
    ).toThrow(ConfigurationError)
  })

  it('rejects a non-positive or fractional timeout', () => {
    for (const timeoutMs of [0, -1, 1.5]) {
      expect(() =>
        createEsewa({
          merchantCode: SANDBOX_PRODUCT_CODE,
          secret: SANDBOX_SECRET,
          environment: 'sandbox',
          timeoutMs,
        })
      ).toThrow(ConfigurationError)
    }
  })
})
