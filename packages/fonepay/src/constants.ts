import type { FonepayEnvironment } from './types.js'

export const FONEPAY_CURRENCY = 'NPR'

/** Fonepay's fixed merchant-detail flag: `P` initiates a payment. */
export const FONEPAY_MD = 'P'

/** Second remark (R2) default, as required by Fonepay. */
export const DEFAULT_REMARKS_2 = 'N/A'

export const PRN_MIN_LENGTH = 3

export const PRN_MAX_LENGTH = 25

/**
 * PRN (the merchant reference) may not contain whitespace or a comma, since the
 * DV message joins the request values with commas.
 */
export const PRN_PATTERN = /^[^\s,]+$/

/**
 * Field order used to build the checkout request DV message. Fonepay joins the
 * raw values with commas in exactly this order.
 */
export const REQUEST_FIELDS = [
  'PID',
  'MD',
  'PRN',
  'AMT',
  'CRN',
  'DT',
  'R1',
  'R2',
  'RU',
] as const

/**
 * Field order used to build the callback response DV message.
 */
export const RESPONSE_FIELDS = [
  'PRN',
  'PID',
  'PS',
  'RC',
  'UID',
  'BC',
  'INI',
  'P_AMT',
  'R_AMT',
] as const

export const REQUEST_URLS: Record<FonepayEnvironment, string> = {
  sandbox: 'https://dev-clientapi.fonepay.com/api/merchantRequest',
  production: 'https://clientapi.fonepay.com/api/merchantRequest',
}

export const VERIFICATION_URLS: Record<FonepayEnvironment, string> = {
  sandbox:
    'https://dev-clientapi.fonepay.com/api/merchantRequest/verificationMerchant',
  production:
    'https://clientapi.fonepay.com/api/merchantRequest/verificationMerchant',
}
