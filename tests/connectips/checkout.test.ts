import { describe, it, expect } from 'vitest'
import {
  createOrder,
  importPkcs8PrivateKey,
  moneyFromDecimal,
  PaymentError,
  type Order,
} from '@nepal-payments/core'
import {
  buildCheckoutTokenMessage,
  buildConnectIpsCheckout,
  createConnectIps,
  resolveConfig,
  type ConnectIpsCheckoutOptions,
  type ConnectIpsFormParams,
} from '@nepal-payments/connectips'
import {
  FIXED_DATE,
  TEST_APP_ID,
  TEST_MERCHANT_ID,
  testConfig,
  testPrivateKeyPem,
  verifyTokenWithCert,
} from './helpers.js'

function order(overrides: Partial<Order> = {}): Order {
  return createOrder({
    id: 'ORD-123',
    amount: moneyFromDecimal('230.00'),
    ...overrides,
  })
}

async function build(
  overrides: Partial<Order> = {},
  options?: ConnectIpsCheckoutOptions
) {
  const config = resolveConfig(testConfig())
  const key = await importPkcs8PrivateKey(testPrivateKeyPem())
  return buildConnectIpsCheckout(config, key, order(overrides), options)
}

describe('buildConnectIpsCheckout', () => {
  it('builds a form_post to the login page with the documented fields', async () => {
    const built = await build()
    expect(built.checkout.type).toBe('form_post')
    expect(built.checkout.url).toBe(
      'https://uat.connectips.com/connectipswebgw/loginpage'
    )
    if (built.checkout.type !== 'form_post') throw new Error('unreachable')
    const params = built.checkout.formParams as ConnectIpsFormParams
    expect(params.MERCHANTID).toBe(TEST_MERCHANT_ID)
    expect(params.APPID).toBe(TEST_APP_ID)
    expect(params.TXNID).toBe('ORD-123')
    expect(params.REFERENCEID).toBe('ORD-123')
    expect(params.TXNCRNCY).toBe('NPR')
    expect(params.TXNAMT).toBe('23000')
    expect(params.TXNDATE).toBe('15-03-2022')
    expect(built.txnRef).toEqual({ id: 'ORD-123', gateway: 'connectips' })
  })

  it('signs a token over the exact NCHL message', async () => {
    const built = await build()
    if (built.checkout.type !== 'form_post') throw new Error('unreachable')
    const params = built.checkout.formParams as ConnectIpsFormParams
    const message = buildCheckoutTokenMessage(params)
    expect(verifyTokenWithCert(message, params.TOKEN)).toBe(true)
  })

  it('converts rupees-at-zero-precision orders to paisa', async () => {
    const built = await build({
      amount: moneyFromDecimal('230', 'NPR', 0),
    })
    if (built.checkout.type !== 'form_post') throw new Error('unreachable')
    expect((built.checkout.formParams as ConnectIpsFormParams).TXNAMT).toBe(
      '23000'
    )
  })

  it('applies remarks and particulars defaults and overrides', async () => {
    const withDefaults = await build({ description: 'Order desc' })
    if (withDefaults.checkout.type !== 'form_post')
      throw new Error('unreachable')
    expect(
      (withDefaults.checkout.formParams as ConnectIpsFormParams).REMARKS
    ).toBe('Order desc')
    expect(
      (withDefaults.checkout.formParams as ConnectIpsFormParams).PARTICULARS
    ).toBe('ORD-123')

    const withOptions = await build({}, { remarks: 'Custom', particulars: 'P' })
    if (withOptions.checkout.type !== 'form_post')
      throw new Error('unreachable')
    expect(
      (withOptions.checkout.formParams as ConnectIpsFormParams).REMARKS
    ).toBe('Custom')
    expect(
      (withOptions.checkout.formParams as ConnectIpsFormParams).PARTICULARS
    ).toBe('P')
  })

  it('rejects order ids that are not valid TXNIDs', async () => {
    for (const id of ['bad id!', 'A'.repeat(21)]) {
      const error = await build({ id }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(PaymentError)
      expect((error as PaymentError).code).toBe('INVALID_ORDER_ID')
    }
  })

  it('rejects over-long remarks', async () => {
    const error = await build({}, { remarks: 'x'.repeat(51) }).catch(
      (e: unknown) => e
    )
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('INVALID_ORDER')
  })

  it('createCheckout returns the same txnRef', async () => {
    const gateway = createConnectIps(testConfig())
    const result = await gateway.createCheckout(order())
    expect(result.txnRef).toEqual({ id: 'ORD-123', gateway: 'connectips' })
    expect(FIXED_DATE.getUTCFullYear()).toBe(2022)
  })
})
