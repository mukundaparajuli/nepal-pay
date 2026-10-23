import { describe, it, expect } from 'vitest'
import { ConfigurationError } from '@nepal-pay/core'
import { createMockGateway, resolveMockConfig } from '@nepal-pay/mock'
import { MOCK_SECRET } from './helpers.js'

describe('mock config', () => {
  it('defaults the scenario to success and checkout url to mock.invalid', () => {
    const config = resolveMockConfig({ secretKey: MOCK_SECRET })
    expect(config.scenario).toBe('success')
    expect(config.checkoutUrl).toBe('https://mock.invalid/pay')
    expect(config.delayMs).toBe(0)
    expect(config.timeoutMs).toBe(10_000)
  })

  it('requires a non-empty secretKey', () => {
    expect(() => resolveMockConfig({ secretKey: '' })).toThrow(
      ConfigurationError
    )
  })

  it('rejects an unknown scenario', () => {
    expect(() =>
      createMockGateway({
        secretKey: MOCK_SECRET,
        scenario: 'bogus' as never,
      })
    ).toThrow(ConfigurationError)
  })

  it('rejects a negative waiting delay', () => {
    expect(() =>
      resolveMockConfig({ secretKey: MOCK_SECRET, delayMs: -1 })
    ).toThrow(ConfigurationError)
  })

  it('rejects a non-positive timeout', () => {
    expect(() =>
      resolveMockConfig({ secretKey: MOCK_SECRET, timeoutMs: 0 })
    ).toThrow(ConfigurationError)
  })

  it('accepts a custom checkout url and delay', () => {
    const config = resolveMockConfig({
      secretKey: MOCK_SECRET,
      scenario: 'delayed',
      checkoutUrl: 'http://localhost:4000/pay',
      delayMs: 25,
    })
    expect(config.checkoutUrl).toBe('http://localhost:4000/pay')
    expect(config.delayMs).toBe(25)
  })
})
