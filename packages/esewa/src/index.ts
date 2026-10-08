import type {
  GatewayAdapter,
  Checkout,
  TxnRef,
  VerifiedPayment,
} from '@nepal-payments/core'
import { ConfigurationError } from '@nepal-payments/core'
import type { EsewaConfig } from './types.js'

export class EsewaGateway implements GatewayAdapter {
  readonly name = 'esewa' as const

  constructor(private readonly config: EsewaConfig) {
    if (!config.merchantCode) {
      throw new ConfigurationError('Merchant code is required')
    }
  }

  async initiate(): Promise<{ checkout: Checkout; txnRef: TxnRef }> {
    throw new Error('Not implemented')
  }

  async verify(): Promise<VerifiedPayment> {
    throw new Error('Not implemented')
  }
}

export * from './types.js'
