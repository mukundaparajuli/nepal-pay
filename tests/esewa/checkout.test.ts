import { describe, it, expect } from 'vitest'
import {
  MoneyError,
  PaymentError,
  createMoney,
  moneyFromDecimal,
} from '@nepal-payments/core'
import { verifySignedFields } from '@nepal-payments/esewa'
import {
  CHECKOUT_SFN,
  SANDBOX_PRODUCT_CODE,
  SANDBOX_SECRET,
  order,
  testGateway,
} from './helpers.js'

describe('eSewa checkout', () => {
  it('returns a form_post checkout targeting the sandbox form endpoint', async () => {
    const result = await testGateway().createCheckout(order())
    expect(result.checkout.type).toBe('form_post')
    expect(result.checkout.type === 'form_post' && result.checkout.url).toBe(
      'https://rc-epay.esewa.com.np/api/epay/main/v2/form'
    )
    expect(result.txnRef).toEqual({ id: 'ORD001', gateway: 'esewa' })
  })

  it('fills every form field', async () => {
    const { checkout } = await testGateway().createCheckout(order())
    if (checkout.type !== 'form_post') throw new Error('expected form_post')
    expect(checkout.formParams).toEqual({
      amount: '230.00',
      tax_amount: '0.00',
      product_service_charge: '0.00',
      product_delivery_charge: '0.00',
      total_amount: '230.00',
      transaction_uuid: 'ORD001',
      product_code: SANDBOX_PRODUCT_CODE,
      success_url: 'https://merchant.example/success',
      failure_url: 'https://merchant.example/failure',
      signed_field_names: CHECKOUT_SFN,
      signature: expect.any(String),
    })
  })

  it('signs the checkout so the sandbox key accepts it', async () => {
    const { checkout } = await testGateway().createCheckout(order())
    if (checkout.type !== 'form_post') throw new Error('expected form_post')
    const {
      total_amount = '',
      transaction_uuid = '',
      product_code = '',
      signed_field_names = '',
      signature = '',
    } = checkout.formParams
    expect(
      await verifySignedFields(
        { total_amount, transaction_uuid, product_code },
        signed_field_names,
        SANDBOX_SECRET,
        signature
      )
    ).toBe(true)
  })

  it('produces the documented message shape for the UAT vector', async () => {
    const { checkout } = await testGateway().createCheckout(
      order({ id: '241028', amount: moneyFromDecimal('110.00') })
    )
    if (checkout.type !== 'form_post') throw new Error('expected form_post')
    const { signed_field_names = '', signature = '' } = checkout.formParams
    expect(
      await verifySignedFields(
        {
          total_amount: '110.00',
          transaction_uuid: '241028',
          product_code: SANDBOX_PRODUCT_CODE,
        },
        signed_field_names,
        SANDBOX_SECRET,
        signature
      )
    ).toBe(true)
  })

  it('deducts surcharges from the payable amount', async () => {
    const { checkout } = await testGateway().createCheckout(
      order({ amount: moneyFromDecimal('200.00') }),
      {
        surcharges: {
          tax: '10.00',
          serviceCharge: '5.00',
          deliveryCharge: '5.00',
        },
      }
    )
    if (checkout.type !== 'form_post') throw new Error('expected form_post')
    expect(checkout.formParams.total_amount).toBe('200.00')
    expect(checkout.formParams.amount).toBe('180.00')
    expect(checkout.formParams.tax_amount).toBe('10.00')
    expect(checkout.formParams.product_service_charge).toBe('5.00')
    expect(checkout.formParams.product_delivery_charge).toBe('5.00')
  })

  it('accepts Money surcharges', async () => {
    const { checkout } = await testGateway().createCheckout(order(), {
      surcharges: { tax: moneyFromDecimal('30.00') },
    })
    if (checkout.type !== 'form_post') throw new Error('expected form_post')
    expect(checkout.formParams.amount).toBe('200.00')
    expect(checkout.formParams.tax_amount).toBe('30.00')
  })

  it('rejects surcharges larger than the order amount', async () => {
    await expect(
      testGateway().createCheckout(order(), {
        surcharges: { tax: '500.00' },
      })
    ).rejects.toThrow(PaymentError)
  })

  it('rejects surcharges that are not 2-decimal NPR', async () => {
    await expect(
      testGateway().createCheckout(order(), {
        surcharges: { tax: createMoney(5n, 'NPR', 0) },
      })
    ).rejects.toThrow(PaymentError)
  })

  it('rejects a surcharge that is not a valid decimal', async () => {
    await expect(
      testGateway().createCheckout(order(), {
        surcharges: { tax: 'ten' },
      })
    ).rejects.toThrow(MoneyError)
  })

  it('rejects a transaction_uuid outside the allowed charset', async () => {
    await expect(
      testGateway().createCheckout(order({ id: 'order_1' }))
    ).rejects.toThrow(PaymentError)
    await expect(
      testGateway().createCheckout(order({ id: 'order 1' }))
    ).rejects.toThrow(PaymentError)
  })

  it('requires a success_url and failure_url from config or the order', async () => {
    const bare = testGateway({ successUrl: undefined, failureUrl: undefined })
    await expect(bare.createCheckout(order())).rejects.toThrow(/success_url/)
    const failureless = testGateway({ failureUrl: undefined })
    await expect(
      failureless.createCheckout(
        order({ returnUrl: 'https://merchant.example/ret' })
      )
    ).rejects.toThrow(/failure_url/)
  })

  it('prefers order return URLs when config has none', async () => {
    const gateway = testGateway({
      successUrl: undefined,
      failureUrl: undefined,
    })
    const { checkout } = await gateway.createCheckout(
      order({
        returnUrl: 'https://merchant.example/ret',
        failureUrl: 'https://merchant.example/fail',
      })
    )
    if (checkout.type !== 'form_post') throw new Error('expected form_post')
    expect(checkout.formParams.success_url).toBe('https://merchant.example/ret')
    expect(checkout.formParams.failure_url).toBe(
      'https://merchant.example/fail'
    )
  })

  it('lets per-call URL options win over config', async () => {
    const { checkout } = await testGateway().createCheckout(order(), {
      successUrl: 'https://other.example/ok',
      failureUrl: 'https://other.example/bad',
    })
    if (checkout.type !== 'form_post') throw new Error('expected form_post')
    expect(checkout.formParams.success_url).toBe('https://other.example/ok')
    expect(checkout.formParams.failure_url).toBe('https://other.example/bad')
  })

  it('rejects non-http return URLs', async () => {
    await expect(
      testGateway().createCheckout(order(), {
        successUrl: 'javascript:alert(1)',
      })
    ).rejects.toThrow(PaymentError)
    const gateway = testGateway({
      successUrl: undefined,
      failureUrl: undefined,
    })
    await expect(
      gateway.createCheckout(
        order({ returnUrl: 'https://merchant.example/ok' })
      )
    ).rejects.toThrow(/failure_url/)
  })
})
