import {
  createOrder,
  moneyFromDecimal,
  type Order,
  type RawCallbackRequest,
} from '@nepal-payments/core'
import {
  buildResponseMessage,
  createFonepay,
  generateFonepayDv,
  type FonepayConfig,
  type FonepayGateway,
} from '@nepal-payments/fonepay'

export const FONEPAY_MERCHANT_CODE = '1234567890'
export const FONEPAY_SECRET = 'fonepay-test-secret'
export const FONEPAY_RETURN_URL = 'https://merchant.example/callback'
export const FIXED_DATE = new Date('2022-03-15T00:00:00Z')
export const TEST_UID = 'FP-UID-12345'
export const TEST_BANK_CODE = 'GBIME'

export function order(overrides: Partial<Order> = {}): Order {
  return createOrder({
    id: 'ORD-123',
    amount: moneyFromDecimal('230.00'),
    returnUrl: FONEPAY_RETURN_URL,
    ...overrides,
  })
}

export function testGateway(
  overrides: Partial<FonepayConfig> = {}
): FonepayGateway {
  return createFonepay({
    merchantCode: FONEPAY_MERCHANT_CODE,
    secretKey: FONEPAY_SECRET,
    environment: 'sandbox',
    returnUrl: FONEPAY_RETURN_URL,
    now: () => FIXED_DATE,
    ...overrides,
  })
}

export interface ResponseOverrides {
  readonly PRN?: string
  readonly PID?: string
  readonly PS?: string
  readonly RC?: string
  readonly UID?: string
  readonly BC?: string
  readonly INI?: string
  readonly P_AMT?: string
  readonly R_AMT?: string
}

export function responseFields(
  overrides: ResponseOverrides = {}
): Record<string, string> {
  return {
    PRN: 'ORD-123',
    PID: FONEPAY_MERCHANT_CODE,
    PS: 'true',
    RC: 'successful',
    UID: TEST_UID,
    BC: TEST_BANK_CODE,
    INI: '9800000001',
    P_AMT: '230.00',
    R_AMT: '0.00',
    ...overrides,
  }
}

/** Build a signed Fonepay redirect callback. */
export async function signedCallback(
  overrides: ResponseOverrides = {},
  secret: string = FONEPAY_SECRET
): Promise<RawCallbackRequest> {
  const fields = responseFields(overrides)
  const dv = await generateFonepayDv(buildResponseMessage(fields), secret)
  return { query: { ...fields, DV: dv } }
}
