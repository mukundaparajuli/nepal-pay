import type {
  GatewayAdapter,
  Checkout,
  TxnRef,
  VerifiedPayment,
} from '@nepal-payments/core'
import { ConfigurationError } from '@nepal-payments/core'
import type { KhaltiConfig } from './types.js'

export class KhaltiGateway implements GatewayAdapter {
  readonly name = 'khalti' as const

  constructor(private readonly config: KhaltiConfig) {
    if (!config.secretKey) {
      throw new ConfigurationError('Secret key is required')
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
