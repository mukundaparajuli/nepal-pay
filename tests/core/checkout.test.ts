import { describe, it, expect } from 'vitest'
import type { Checkout, CheckoutType } from '@nepal-payments/core'

describe('Checkout', () => {
  it('supports redirect type', () => {
    const checkout: Checkout = {
      type: 'redirect',
      url: 'https://example.com/pay',
    }
    expect(checkout.type).toBe('redirect')
    expect(checkout.url).toBe('https://example.com/pay')
  })

  it('supports form_post type', () => {
    const checkout: Checkout = {
      type: 'form_post',
      url: 'https://example.com/pay',
      formParams: { key1: 'value1' },
    }
    expect(checkout.type).toBe('form_post')
    expect(checkout.formParams?.key1).toBe('value1')
  })

  it('includes headers optionally', () => {
    const checkout: Checkout = {
      type: 'redirect',
      url: 'https://example.com/pay',
      headers: { 'X-Test': 'test' },
    }
    expect(checkout.headers?.['X-Test']).toBe('test')
  })
})
