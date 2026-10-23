import { describe, it, expect } from 'vitest'
import type { Checkout, CheckoutType } from '@nepal-pay/core'

function summarize(checkout: Checkout): string {
  switch (checkout.type) {
    case 'redirect':
      return `redirect:${checkout.url}`
    case 'form_post': {
      const keys = checkout.formParams ? Object.keys(checkout.formParams) : []
      return `form_post:${checkout.url}:${keys.join(',')}`
    }
  }
}

describe('Checkout', () => {
  it('has exactly two variants', () => {
    const variants: CheckoutType[] = ['redirect', 'form_post']
    expect(variants).toEqual(['redirect', 'form_post'])
  })

  it('supports redirect variant with url only', () => {
    const checkout: Checkout = {
      type: 'redirect',
      url: 'https://example.com/pay',
    }
    expect(checkout.type).toBe('redirect')
    expect(checkout.url).toBe('https://example.com/pay')
    expect('formParams' in checkout).toBe(false)
    expect('headers' in checkout).toBe(false)
  })

  it('supports form_post variant with formParams', () => {
    const checkout: Checkout = {
      type: 'form_post',
      url: 'https://example.com/pay',
      formParams: { amt: '100.00', psc: '0' },
    }
    expect(checkout.type).toBe('form_post')
    expect(checkout.url).toBe('https://example.com/pay')
    expect(checkout.formParams).toEqual({ amt: '100.00', psc: '0' })
  })

  it('rejects form_post without formParams', () => {
    // @ts-expect-error formParams is required on form_post
    const checkout: Checkout = {
      type: 'form_post',
      url: 'https://example.com/pay',
    }
    expect(checkout.type).toBe('form_post')
    expect('formParams' in checkout).toBe(false)
  })

  it('supports optional headers on both variants', () => {
    const redirect: Checkout = {
      type: 'redirect',
      url: 'https://example.com/pay',
      headers: { 'X-Test': 'test' },
    }
    const formPost: Checkout = {
      type: 'form_post',
      url: 'https://example.com/pay',
      formParams: { amt: '100.00' },
      headers: { 'X-Test': 'test' },
    }
    expect(redirect.headers?.['X-Test']).toBe('test')
    expect(formPost.headers?.['X-Test']).toBe('test')
  })

  it('narrows variants exhaustively via the discriminant', () => {
    const redirect: Checkout = {
      type: 'redirect',
      url: 'https://example.com/pay',
    }
    const formPost: Checkout = {
      type: 'form_post',
      url: 'https://example.com/post',
      formParams: { amt: '500.00' },
    }
    expect(summarize(redirect)).toBe('redirect:https://example.com/pay')
    expect(summarize(formPost)).toBe('form_post:https://example.com/post:amt')
  })

  it('rejects formParams on the redirect variant', () => {
    const checkout: Checkout = {
      type: 'redirect',
      url: 'https://example.com',
      // @ts-expect-error formParams only exists on form_post
      formParams: { a: '1' },
    }
    expect(checkout.type).toBe('redirect')
  })

  it('rejects unknown checkout types', () => {
    // @ts-expect-error only redirect and form_post are allowed
    const checkout: Checkout = { type: 'qr', url: 'https://example.com' }
    expect(checkout.type).toBe('qr')
  })

  it('rejects checkout without url', () => {
    // @ts-expect-error url is required on both variants
    const checkout: Checkout = { type: 'redirect' }
    expect(checkout.url).toBeUndefined()
  })
})
