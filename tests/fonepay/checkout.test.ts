import { describe, it, expect } from 'vitest'
import {
  createOrder,
  moneyFromDecimal,
  PaymentError,
  type Order,
} from '@nepal-payments/core'
import {
  buildFonepayCheckout,
  buildRequestMessage,
  createFonepay,
  resolveConfig,
  verifyFonepayDv,
  type FonepayCheckoutOptions,
} from '@nepal-payments/fonepay'
import {
  FIXED_DATE,
  FONEPAY_MERCHANT_CODE,
  FONEPAY_SECRET,
  FONEPAY_RETURN_URL,
  testGateway,
} from './helpers.js'

function order(overrides: Partial<Order> = {}): Order {
  return createOrder({
    id: 'ORD-123',
    amount: moneyFromDecimal('230.00'),
    returnUrl: FONEPAY_RETURN_URL,
    ...overrides,
  })
}

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams
}

async function build(
  overrides: Partial<Order> = {},
  options?: FonepayCheckoutOptions
) {
  const config = resolveConfig({
    merchantCode: FONEPAY_MERCHANT_CODE,
    secretKey: FONEPAY_SECRET,
    environment: 'sandbox',
    returnUrl: FONEPAY_RETURN_URL,
    now: () => FIXED_DATE,
  })
  return buildFonepayCheckout(config, order(overrides), options)
}

describe('buildFonepayCheckout', () => {
  it('builds a redirect to the sandbox request URL with documented fields', async () => {
    const built = await build({ description: 'Order ORD-123' })
    expect(built.checkout.type).toBe('redirect')
    expect(
      built.checkout.url.startsWith(
        'https://dev-clientapi.fonepay.com/api/merchantRequest?'
      )
    ).toBe(true)
    const params = paramsOf(built.checkout.url)
    expect(params.get('PID')).toBe(FONEPAY_MERCHANT_CODE)
    expect(params.get('MD')).toBe('P')
    expect(params.get('PRN')).toBe('ORD-123')
    expect(params.get('AMT')).toBe('230.00')
    expect(params.get('CRN')).toBe('NPR')
    expect(params.get('DT')).toBe('03/15/2022')
    expect(params.get('R1')).toBe('Order ORD-123')
    expect(params.get('R2')).toBe('N/A')
    expect(params.get('RU')).toBe(FONEPAY_RETURN_URL)
    expect(built.txnRef).toEqual({ id: 'ORD-123', gateway: 'fonepay' })
  })

  it('signs a DV over the exact request message', async () => {
    const built = await build()
    const params = paramsOf(built.checkout.url)
    const values = {
      PID: params.get('PID') ?? '',
      MD: params.get('MD') ?? '',
      PRN: params.get('PRN') ?? '',
      AMT: params.get('AMT') ?? '',
      CRN: params.get('CRN') ?? '',
      DT: params.get('DT') ?? '',
      R1: params.get('R1') ?? '',
      R2: params.get('R2') ?? '',
      RU: params.get('RU') ?? '',
    }
    expect(
      await verifyFonepayDv(
        buildRequestMessage(values),
        FONEPAY_SECRET,
        params.get('DV') ?? ''
      )
    ).toBe(true)
  })

  it('formats zero-precision rupee amounts with two decimals', async () => {
    const built = await build({ amount: moneyFromDecimal('230', 'NPR', 0) })
    expect(paramsOf(built.checkout.url).get('AMT')).toBe('230.00')
  })

  it('uses the order description as R1 and defaults R2 to N/A', async () => {
    const built = await build({ description: 'Widget purchase' })
    const params = paramsOf(built.checkout.url)
    expect(params.get('R1')).toBe('Widget purchase')
    expect(params.get('R2')).toBe('N/A')
  })

  it('defaults R1 to "Order <id>" when no description is present', async () => {
    const built = await build()
    expect(paramsOf(built.checkout.url).get('R1')).toBe('Order ORD-123')
  })

  it('applies options and config overrides for remarks and return URL', async () => {
    const withOptions = await build(
      {},
      {
        remarks1: 'Custom R1',
        remarks2: 'Custom R2',
        returnUrl: 'https://merchant.example/other',
      }
    )
    const params = paramsOf(withOptions.checkout.url)
    expect(params.get('R1')).toBe('Custom R1')
    expect(params.get('R2')).toBe('Custom R2')
    expect(params.get('RU')).toBe('https://merchant.example/other')
  })

  it('requires a return URL', async () => {
    const config = resolveConfig({
      merchantCode: FONEPAY_MERCHANT_CODE,
      secretKey: FONEPAY_SECRET,
      environment: 'sandbox',
      now: () => FIXED_DATE,
    })
    const error = await buildFonepayCheckout(
      config,
      order({ returnUrl: undefined })
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('INVALID_URL')
  })

  it('rejects order ids that are not valid PRNs', async () => {
    for (const id of ['ab', 'A'.repeat(26), 'bad id!', 'has,comma']) {
      const error = await build({ id }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(PaymentError)
      expect((error as PaymentError).code).toBe('INVALID_ORDER_ID')
    }
  })

  it('rejects remarks containing a comma', async () => {
    const error = await build({}, { remarks1: 'a,b' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PaymentError)
    expect((error as PaymentError).code).toBe('INVALID_ORDER')
  })

  it('createCheckout returns the same txnRef', async () => {
    const gateway = createFonepay({
      merchantCode: FONEPAY_MERCHANT_CODE,
      secretKey: FONEPAY_SECRET,
      environment: 'sandbox',
      returnUrl: FONEPAY_RETURN_URL,
      now: () => FIXED_DATE,
    })
    const result = await gateway.createCheckout(order())
    expect(result.txnRef).toEqual({ id: 'ORD-123', gateway: 'fonepay' })
    expect(FIXED_DATE.getFullYear).toBeTypeOf('function')
  })
})

describe('resolveConfig', () => {
  it('selects production URLs by default', () => {
    const config = resolveConfig({
      merchantCode: FONEPAY_MERCHANT_CODE,
      secretKey: FONEPAY_SECRET,
      environment: 'production',
    })
    expect(config.requestUrl).toBe(
      'https://clientapi.fonepay.com/api/merchantRequest'
    )
    expect(config.verificationUrl).toBe(
      'https://clientapi.fonepay.com/api/merchantRequest/verificationMerchant'
    )
    expect(config.serverVerification).toBe(true)
  })

  it('rejects a missing secret key', () => {
    expect(() =>
      resolveConfig({
        merchantCode: FONEPAY_MERCHANT_CODE,
        secretKey: '',
        environment: 'sandbox',
      })
    ).toThrow()
  })
})

describe('testGateway', () => {
  it('returns a gateway bound to the sandbox', () => {
    expect(testGateway().config.environment).toBe('sandbox')
  })
})
