import {
  type CheckoutResult,
  type GatewayAdapter,
  type Order,
  type RawCallbackRequest,
  type TxnRef,
  type UnverifiedCallback,
  type VerifyOptions,
  type VerifiedPayment,
} from '@nepal-payments/core'
import type {
  KhaltiCheckoutOptions,
  KhaltiConfig,
  KhaltiStatusOptions,
} from './types.js'
import { resolveConfig } from './config.js'
import { buildKhaltiCheckout } from './checkout.js'
import { parseKhaltiCallback } from './callback.js'
import { checkKhaltiStatus, verifyKhaltiPayment } from './verify.js'

export function createKhalti(input: KhaltiConfig): KhaltiGateway {
  return new KhaltiGateway(resolveConfig(input))
}

export class KhaltiGateway implements GatewayAdapter {
  readonly name = 'khalti' as const

  constructor(readonly config: ReturnType<typeof resolveConfig>) {}

  async createCheckout(
    order: Order,
    options?: KhaltiCheckoutOptions
  ): Promise<CheckoutResult> {
    const built = await buildKhaltiCheckout(this.config, order, options)
    return {
      checkout: built.checkout,
      txnRef: { id: built.pidx, gateway: 'khalti' },
    }
  }

  parseCallback(request: RawCallbackRequest): UnverifiedCallback {
    return parseKhaltiCallback(request)
  }

  verify(
    callback: UnverifiedCallback,
    options: VerifyOptions
  ): Promise<VerifiedPayment> {
    return verifyKhaltiPayment(this.config, callback, options.expected)
  }

  status(
    txnRef: TxnRef,
    options?: KhaltiStatusOptions
  ): Promise<VerifiedPayment> {
    return checkKhaltiStatus(this.config, txnRef, options)
  }
}

export * from './types.js'
export { mapKhaltiStatus, khaltiPaisaToMoney } from './status.js'
export { PIDX_PATTERN, MIN_AMOUNT_PAISA } from './constants.js'
