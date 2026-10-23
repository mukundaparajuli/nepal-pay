import { describe, it, expect } from 'vitest'
import { ConfigurationError } from '@nepal-pay/core'
import { createConnectIps, resolveConfig } from '@nepal-pay/connectips'
import { testConfig } from './helpers.js'

function capture(fn: () => unknown): unknown {
  try {
    return fn()
  } catch (error) {
    return error
  }
}

describe('resolveConfig', () => {
  it('resolves sandbox endpoints by default', () => {
    const resolved = resolveConfig(testConfig())
    expect(resolved.loginUrl).toBe(
      'https://uat.connectips.com/connectipswebgw/loginpage'
    )
    expect(resolved.validationUrl).toBe(
      'https://uat.connectips.com/connectipswebws/api/creditor/validatetxn'
    )
    expect(resolved.txnDetailUrl).toBe(
      'https://uat.connectips.com/connectipswebws/api/creditor/gettxndetail'
    )
    expect(resolved.timeoutMs).toBe(10_000)
  })

  it('resolves production endpoints', () => {
    const resolved = resolveConfig(testConfig({ environment: 'production' }))
    expect(resolved.loginUrl).toContain('https://connectips.com/')
  })

  it('honours an explicit baseUrl and strips trailing slashes', () => {
    const resolved = resolveConfig(
      testConfig({ baseUrl: 'https://proxy.example/connectips/' })
    )
    expect(resolved.loginUrl).toBe(
      'https://proxy.example/connectips/connectipswebgw/loginpage'
    )
  })

  it('requires every credential field', () => {
    for (const field of [
      'merchantId',
      'appId',
      'appName',
      'password',
      'privateKey',
    ] as const) {
      const error = capture(() => resolveConfig(testConfig({ [field]: '' })))
      expect(error).toBeInstanceOf(ConfigurationError)
    }
  })

  it('rejects an unknown environment', () => {
    const error = capture(() =>
      resolveConfig(testConfig({ environment: 'staging' as 'sandbox' }))
    )
    expect(error).toBeInstanceOf(ConfigurationError)
  })

  it('rejects invalid urls and timeouts', () => {
    expect(
      capture(() => resolveConfig(testConfig({ loginUrl: 'not-a-url' })))
    ).toBeInstanceOf(ConfigurationError)
    expect(
      capture(() => resolveConfig(testConfig({ timeoutMs: 0 })))
    ).toBeInstanceOf(ConfigurationError)
  })

  it('createConnectIps builds a gateway bound to the resolved config', () => {
    const gateway = createConnectIps(testConfig())
    expect(gateway.name).toBe('connectips')
    expect(gateway.config.environment).toBe('sandbox')
  })
})
