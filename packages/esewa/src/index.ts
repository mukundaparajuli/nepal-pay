import {
  type CheckoutResult,
  type GatewayAdapter,
  type Order,
  type RawCallbackRequest,
  type TxnRef,
  type UnverifiedCallback,
  type VerifyOptions,
  type VerifiedPayment,
} from '@nepal-pay/core'
import type {
  EsewaConfig,
  EsewaCheckoutOptions,
  EsewaStatusOptions,
} from './types.js'
import { resolveConfig } from './config.js'
import { buildEsewaCheckout } from './checkout.js'
import { parseEsewaCallback } from './callback.js'
import { checkEsewaStatus, verifyEsewaPayment } from './verify.js'

export function createEsewa(input: EsewaConfig): EsewaGateway {
  return new EsewaGateway(resolveConfig(input))
}

export class EsewaGateway implements GatewayAdapter {
  readonly name = 'esewa' as const

  constructor(readonly config: ReturnType<typeof resolveConfig>) {}

  async createCheckout(
    order: Order,
    options?: EsewaCheckoutOptions
  ): Promise<CheckoutResult> {
    const built = await buildEsewaCheckout(this.config, order, options)
    return {
      checkout: built.checkout,
      txnRef: { id: built.transactionUuid, gateway: 'esewa' },
    }
  }

  parseCallback(request: RawCallbackRequest): UnverifiedCallback {
    return parseEsewaCallback(request)
  }

  verify(
    callback: UnverifiedCallback,
    options: VerifyOptions
  ): Promise<VerifiedPayment> {
    return verifyEsewaPayment(this.config, callback, options.expected)
  }

  status(
    txnRef: TxnRef,
    options?: EsewaStatusOptions
  ): Promise<VerifiedPayment> {
    return checkEsewaStatus(this.config, txnRef, options)
  }
}

export * from './types.js'
export {
  buildSignatureMessage,
  signFields,
  verifySignedFields,
  decodeRawJsonTokens,
} from './signing.js'
export { mapEsewaStatus } from './status.js'
export {
  CHECKOUT_SIGNED_FIELD_NAMES,
  TRANSACTION_UUID_PATTERN,
} from './constants.js'
