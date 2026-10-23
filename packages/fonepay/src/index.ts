import {
  type CheckoutResult,
  type GatewayAdapter,
  type Order,
  type RawCallbackRequest,
  type TxnRef,
  type UnverifiedCallback,
  type VerifiedPayment,
  type VerifyOptions,
} from '@nepal-pay/core'
import type {
  FonepayCheckoutOptions,
  FonepayConfig,
  FonepayStatusOptions,
  ResolvedFonepayConfig,
} from './types.js'
import { resolveConfig } from './config.js'
import { buildFonepayCheckout } from './checkout.js'
import { parseFonepayCallback } from './callback.js'
import { checkFonepayStatus } from './status.js'
import { verifyFonepayPayment } from './verify.js'

export function createFonepay(input: FonepayConfig): FonepayGateway {
  return new FonepayGateway(resolveConfig(input))
}

export class FonepayGateway implements GatewayAdapter {
  readonly name = 'fonepay' as const

  constructor(readonly config: ResolvedFonepayConfig) {}

  async createCheckout(
    order: Order,
    options?: FonepayCheckoutOptions
  ): Promise<CheckoutResult> {
    const built = await buildFonepayCheckout(this.config, order, options)
    return { checkout: built.checkout, txnRef: built.txnRef }
  }

  parseCallback(request: RawCallbackRequest): UnverifiedCallback {
    return parseFonepayCallback(request)
  }

  verify(
    callback: UnverifiedCallback,
    options: VerifyOptions
  ): Promise<VerifiedPayment> {
    return verifyFonepayPayment(this.config, callback, options.expected)
  }

  status(
    txnRef: TxnRef,
    options?: FonepayStatusOptions
  ): Promise<VerifiedPayment> {
    return checkFonepayStatus(this.config, txnRef, options)
  }
}

export * from './types.js'
export { resolveConfig } from './config.js'
export { buildFonepayCheckout } from './checkout.js'
export type { FonepayParams } from './checkout.js'
export { parseFonepayCallback } from './callback.js'
export {
  buildRequestMessage,
  buildResponseMessage,
  generateFonepayDv,
  verifyFonepayDv,
} from './signing.js'
export {
  assertFonepayPrn,
  checkFonepayStatus,
  mapFonepayResponseCode,
  mapFonepayVerification,
  queryVerification,
} from './status.js'
export { verifyFonepayPayment } from './verify.js'
export { verificationUrlFor } from './api.js'
export { fonepayAmountFromMoney, fonepayMoneyFromAmount } from './money.js'
export { formatFonepayDate, isHttpUrl, isValidPrn } from './validation.js'
export {
  DEFAULT_REMARKS_2,
  FONEPAY_CURRENCY,
  FONEPAY_MD,
  PRN_MAX_LENGTH,
  PRN_MIN_LENGTH,
  PRN_PATTERN,
  REQUEST_FIELDS,
  REQUEST_URLS,
  RESPONSE_FIELDS,
  VERIFICATION_URLS,
} from './constants.js'
