import {
  importPkcs8PrivateKey,
  type CheckoutResult,
  type GatewayAdapter,
  type Order,
  type RawCallbackRequest,
  type RsaPrivateKey,
  type TxnRef,
  type UnverifiedCallback,
  type VerifiedPayment,
  type VerifyOptions,
} from '@nepal-payments/core'
import type {
  ConnectIpsCheckoutOptions,
  ConnectIpsConfig,
  ConnectIpsStatusOptions,
  ResolvedConnectIpsConfig,
} from './types.js'
import { resolveConfig } from './config.js'
import { buildConnectIpsCheckout } from './checkout.js'
import { parseConnectIpsCallback } from './callback.js'
import { checkConnectIpsStatus } from './status.js'
import { verifyConnectIpsPayment } from './verify.js'

export function createConnectIps(input: ConnectIpsConfig): ConnectIpsGateway {
  return new ConnectIpsGateway(resolveConfig(input))
}

export class ConnectIpsGateway implements GatewayAdapter {
  readonly name = 'connectips' as const

  private keyPromise?: Promise<RsaPrivateKey>

  constructor(readonly config: ResolvedConnectIpsConfig) {}

  private signingKey(): Promise<RsaPrivateKey> {
    if (this.keyPromise === undefined) {
      this.keyPromise = importPkcs8PrivateKey(this.config.privateKey)
    }
    return this.keyPromise
  }

  async createCheckout(
    order: Order,
    options?: ConnectIpsCheckoutOptions
  ): Promise<CheckoutResult> {
    const key = await this.signingKey()
    const built = await buildConnectIpsCheckout(
      this.config,
      key,
      order,
      options
    )
    return { checkout: built.checkout, txnRef: built.txnRef }
  }

  parseCallback(request: RawCallbackRequest): UnverifiedCallback {
    return parseConnectIpsCallback(request)
  }

  async verify(
    callback: UnverifiedCallback,
    options: VerifyOptions
  ): Promise<VerifiedPayment> {
    const key = await this.signingKey()
    return verifyConnectIpsPayment(this.config, key, callback, options.expected)
  }

  async status(
    txnRef: TxnRef,
    options?: ConnectIpsStatusOptions
  ): Promise<VerifiedPayment> {
    const key = await this.signingKey()
    return checkConnectIpsStatus(this.config, key, txnRef, options)
  }
}

export * from './types.js'
export { resolveConfig } from './config.js'
export { buildConnectIpsCheckout } from './checkout.js'
export type { ConnectIpsCheckout, ConnectIpsFormParams } from './checkout.js'
export { parseConnectIpsCallback } from './callback.js'
export {
  buildCheckoutTokenMessage,
  buildValidationTokenMessage,
  signConnectIpsToken,
  verifyConnectIpsToken,
} from './signing.js'
export {
  checkConnectIpsStatus,
  mapConnectIpsStatus,
  queryTxnDetail,
  queryValidation,
} from './status.js'
export { verifyConnectIpsPayment } from './verify.js'
export { connectIpsMoneyFromAmount, connectIpsPaisaFromMoney } from './money.js'
export { formatConnectIpsDate, isHttpUrl, isValidTxnId } from './validation.js'
export {
  CHECKOUT_TOKEN_FIELDS,
  CONNECTIPS_CURRENCY,
  PARTICULARS_MAX_LENGTH,
  REFERENCEID_MAX_LENGTH,
  REMARKS_MAX_LENGTH,
  SUCCESS_CREDIT_STATUSES,
  TXNID_MAX_LENGTH,
  TXNID_PATTERN,
} from './constants.js'
