import type {
  GatewayAdapter,
  CheckoutResult,
  VerifiedPayment,
  UnverifiedCallback,
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

  async createCheckout(): Promise<CheckoutResult> {
    throw new Error('Not implemented')
  }

  parseCallback(): UnverifiedCallback {
    throw new Error('Not implemented')
  }

  async verify(): Promise<VerifiedPayment> {
    throw new Error('Not implemented')
  }

  async status(): Promise<VerifiedPayment> {
    throw new Error('Not implemented')
  }
}

export * from './types.js'
