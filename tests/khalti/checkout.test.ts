import { describe, it, expect } from 'vitest'
import { PaymentError, moneyFromDecimal } from '@nepal-payments/core'
import {
  SANDBOX_INITIATE_URL,
  SANDBOX_SECRET,
  captureError,
  hangingFetch,
  order,
  stubRequest,
  testGateway,
} from './helpers.js'

describe('khalti checkout', () => {
  it('returns a redirect checkout with the payment_url and pidx txnRef', async () => {
    const gateway = testGateway({
      fetch: stubRequest(() => ({
        body: {
          pidx: 'bZQLD9wRVWo4CdESSfuSsB',
          payment_url:
            'https://test-pay.khalti.com/?pidx=bZQLD9wRVWo4CdESSfuSsB',
          expires_at: '2023-05-25T16:26:16.471649+05:45',
          expires_in: 1800,
        },
      })).fetch,
    })
    const result = await gateway.createCheckout(order())
    expect(result.checkout.type).toBe('redirect')
    expect(result.checkout.url).toBe(
      'https://test-pay.khalti.com/?pidx=bZQLD9wRVWo4CdESSfuSsB'
    )
    expect(result.txnRef).toEqual({
      id: 'bZQLD9wRVWo4CdESSfuSsB',
      gateway: 'khalti',
    })
  })

  it('posts the initiate request with the secret key and paisa amount', async () => {
    const { fetch, calls } = stubRequest(() => ({
      body: { pidx: 'P1', payment_url: 'https://test-pay.khalti.com/?pidx=P1' },
    }))
    const gateway = testGateway({ fetch })
    await gateway.createCheckout(
      order({
        id: 'ORD001',
        productName: 'Consultation',
        customerName: 'Ramesh',
        customerEmail: 'r@example.com',
        customerPhone: '9800000001',
      })
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(SANDBOX_INITIATE_URL)
    expect(calls[0]?.init?.headers).toMatchObject({
      authorization: `Key ${SANDBOX_SECRET}`,
      'content-type': 'application/json',
    })
    expect(calls[0]?.body).toMatchObject({
      return_url: 'https://merchant.example/callback',
      website_url: 'https://merchant.example',
      amount: 23000,
      purchase_order_id: 'ORD001',
      purchase_order_name: 'Consultation',
      customer_info: {
        name: 'Ramesh',
        email: 'r@example.com',
        phone: '9800000001',
      },
    })
  })

  it('omits customer_info when the order has no customer fields', async () => {
    const { fetch, calls } = stubRequest(() => ({
      body: { pidx: 'P1', payment_url: 'https://test-pay.khalti.com/?pidx=P1' },
    }))
    const gateway = testGateway({ fetch })
    await gateway.createCheckout(order())
    expect(calls[0]?.body).toEqual({
      return_url: 'https://merchant.example/callback',
      website_url: 'https://merchant.example',
      amount: 23000,
      purchase_order_id: 'ORD001',
      purchase_order_name: 'ORD001',
    })
  })

  it('falls back to the order returnUrl and derives the website_url origin', async () => {
    const { fetch, calls } = stubRequest(() => ({
      body: { pidx: 'P1', payment_url: 'https://pay.example/?pidx=P1' },
    }))
    const gateway = testGateway({
      returnUrl: undefined,
      websiteUrl: undefined,
      fetch,
    })
    await gateway.createCheckout(
      order({ returnUrl: 'https://shop.example/v2/complete' })
    )
    expect(calls[0]?.body).toMatchObject({
      return_url: 'https://shop.example/v2/complete',
      website_url: 'https://shop.example',
    })
  })

  it('lets options override config and order URLs', async () => {
    const { fetch, calls } = stubRequest(() => ({
      body: { pidx: 'P1', payment_url: 'https://pay.example/?pidx=P1' },
    }))
    const gateway = testGateway({ fetch })
    await gateway.createCheckout(order(), {
      returnUrl: 'https://opt.example/cb',
      websiteUrl: 'https://opt.example',
    })
    expect(calls[0]?.body).toMatchObject({
      return_url: 'https://opt.example/cb',
      website_url: 'https://opt.example',
    })
  })

  it('accepts a purchaseOrderName option', async () => {
    const { fetch, calls } = stubRequest(() => ({
      body: { pidx: 'P1', payment_url: 'https://pay.example/?pidx=P1' },
    }))
    const gateway = testGateway({ fetch })
    await gateway.createCheckout(order(), { purchaseOrderName: 'Clinic Fee' })
    expect(calls[0]?.body).toMatchObject({ purchase_order_name: 'Clinic Fee' })
  })

  it('rejects amounts below Rs. 10', async () => {
    const gateway = testGateway({ fetch: fetchReturning({}) })
    const error = await captureError(() =>
      gateway.createCheckout(order({ amount: moneyFromDecimal('9.99') }))
    )
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('INVALID_AMOUNT')
  })

  it('accepts exactly Rs. 10', async () => {
    const { fetch } = stubRequest(() => ({
      body: { pidx: 'P1', payment_url: 'https://pay.example/?pidx=P1' },
    }))
    const gateway = testGateway({ fetch })
    const result = await gateway.createCheckout(
      order({ amount: moneyFromDecimal('10.00') })
    )
    expect(result.txnRef.id).toBe('P1')
  })

  it('rejects amounts that exceed the safe integer range in paisa', async () => {
    const gateway = testGateway({ fetch: fetchReturning({}) })
    const error = await captureError(() =>
      gateway.createCheckout(
        order({ amount: moneyFromDecimal('90071992547410.00') })
      )
    )
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('UNSAFE_AMOUNT')
  })

  it('rejects amounts with more than 2 decimal places', async () => {
    const gateway = testGateway({ fetch: fetchReturning({}) })
    const error = await captureError(() =>
      gateway.createCheckout(
        order({ amount: moneyFromDecimal('100.00', 'NPR', 3) })
      )
    )
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('INVALID_AMOUNT')
  })

  it('requires a return_url when neither config nor order provides one', async () => {
    const gateway = testGateway({
      returnUrl: undefined,
      fetch: fetchReturning({}),
    })
    const error = await captureError(() =>
      gateway.createCheckout(order({ returnUrl: undefined }))
    )
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('INVALID_URL')
  })

  it('rejects invalid return URLs', async () => {
    const gateway = testGateway({ fetch: fetchReturning({}) })
    const error = await captureError(() =>
      gateway.createCheckout(order({ returnUrl: 'ftp://example.com' }))
    )
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('INVALID_URL')
  })

  it('rejects invalid website URLs', async () => {
    const gateway = testGateway({ fetch: fetchReturning({}) })
    const error = await captureError(() =>
      gateway.createCheckout(order(), { websiteUrl: '::bad' })
    )
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('INVALID_URL')
  })

  it('surfaces the gateway error detail on a failed initiate', async () => {
    const gateway = testGateway({
      fetch: stubRequest(() => ({
        status: 401,
        body: { detail: 'Invalid token.', status_code: 401 },
      })).fetch,
    })
    const error = await captureError(() => gateway.createCheckout(order()))
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('INVALID_STATUS')
    expect((error as PaymentError).message).toContain('Invalid token.')
  })

  it('errors on malformed initiate JSON', async () => {
    const gateway = testGateway({
      fetch: stubRequest(() => ({ text: '{not json' })).fetch,
    })
    const error = await captureError(() => gateway.createCheckout(order()))
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('INVALID_STATUS')
  })

  it('errors when the initiate response lacks pidx or payment_url', async () => {
    for (const body of [{}, { pidx: '' }, { pidx: 'P1' }]) {
      const gateway = testGateway({ fetch: fetchReturning(body) })
      const error = await captureError(() => gateway.createCheckout(order()))
      expect(error).toBeInstanceOf(PaymentError)
      expect((error as PaymentError).code).toBe('INVALID_STATUS')
    }
  })

  it('errors on a non-http payment_url', async () => {
    const gateway = testGateway({
      fetch: fetchReturning({ pidx: 'P1', payment_url: 'javascript:alert(1)' }),
    })
    const error = await captureError(() => gateway.createCheckout(order()))
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('INVALID_STATUS')
  })

  it('aborts instead of hanging when the initiate never responds', async () => {
    const gateway = testGateway({ fetch: hangingFetch(), timeoutMs: 50 })
    await expect(gateway.createCheckout(order())).rejects.toThrow()
  })
})

function fetchReturning(body: unknown): typeof globalThis.fetch {
  return stubRequest(() => ({ body })).fetch
}
