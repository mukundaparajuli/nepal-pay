import { PaymentError, type Order } from '@nepal-pay/core'
import { DEFAULT_REMARKS_2, FONEPAY_CURRENCY, FONEPAY_MD } from './constants.js'
import type {
  FonepayCheckout,
  FonepayCheckoutOptions,
  ResolvedFonepayConfig,
} from './types.js'
import { fonepayAmountFromMoney } from './money.js'
import { buildRequestMessage, generateFonepayDv } from './signing.js'
import { formatFonepayDate, isHttpUrl, isValidPrn } from './validation.js'

export interface FonepayParams {
  readonly [key: string]: string
  readonly PID: string
  readonly MD: string
  readonly PRN: string
  readonly AMT: string
  readonly CRN: string
  readonly DT: string
  readonly R1: string
  readonly R2: string
  readonly RU: string
  readonly DV: string
}

function requireNoComma(value: string, label: string): string {
  if (value.includes(',')) {
    throw new PaymentError(
      `Fonepay ${label} cannot contain a comma`,
      'INVALID_ORDER'
    )
  }
  return value
}

/**
 * Build the Fonepay checkout redirect URL.
 *
 * Fonepay is a GET redirect: the merchant sends the signed parameters in the
 * query string and the payer is returned to `RU` with a signed callback.
 */
export async function buildFonepayCheckout(
  config: ResolvedFonepayConfig,
  order: Order,
  options?: FonepayCheckoutOptions
): Promise<FonepayCheckout> {
  const prn = order.id
  if (!isValidPrn(prn)) {
    throw new PaymentError(
      'Fonepay order id must be 3-25 characters without spaces or commas',
      'INVALID_ORDER_ID'
    )
  }

  const amount = fonepayAmountFromMoney(order.amount)
  const date = formatFonepayDate(config.now())

  const returnUrl = options?.returnUrl ?? config.returnUrl ?? order.returnUrl
  if (returnUrl === undefined) {
    throw new PaymentError(
      'Fonepay checkout requires a return URL (config.returnUrl, options.returnUrl or order.returnUrl)',
      'INVALID_URL'
    )
  }
  if (!isHttpUrl(returnUrl)) {
    throw new PaymentError(
      `Invalid Fonepay returnUrl: ${String(returnUrl)}`,
      'INVALID_URL'
    )
  }

  const remarks1 = requireNoComma(
    options?.remarks1 ?? config.remarks1 ?? order.description ?? `Order ${prn}`,
    'R1'
  )
  const remarks2 = requireNoComma(
    options?.remarks2 ?? config.remarks2 ?? DEFAULT_REMARKS_2,
    'R2'
  )

  const values = {
    PID: config.merchantCode,
    MD: FONEPAY_MD,
    PRN: prn,
    AMT: amount,
    CRN: FONEPAY_CURRENCY,
    DT: date,
    R1: remarks1,
    R2: remarks2,
    RU: returnUrl,
  }
  const dv = await generateFonepayDv(
    buildRequestMessage(values),
    config.secretKey
  )

  const params: FonepayParams = { ...values, DV: dv }
  const url = `${config.requestUrl}?${new URLSearchParams(params).toString()}`

  return {
    txnRef: { id: prn, gateway: 'fonepay' },
    checkout: { type: 'redirect' as const, url },
  }
}
