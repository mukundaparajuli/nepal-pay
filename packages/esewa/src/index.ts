import type {
  GatewayAdapter,
  CheckoutResult,
  VerifiedPayment,
  UnverifiedCallback,
  PaymentMethod,
} from '@nepal-payments/core'
import { ConfigurationError } from '@nepal-payments/core'
import type { EsewaConfig } from './types.js'

export class EsewaGateway implements GatewayAdapter {
  readonly name: PaymentMethod = 'esewa'

  constructor(private readonly config: EsewaConfig) {
    if (!config.merchantCode) {
      throw new ConfigurationError('Merchant code is required')
    }
  }

  async createCheckout(): Promise<CheckoutResult> {
    throw new ConfigurationError(
      'Esewa createCheckout is not implemented',
      'NOT_IMPLEMENTED'
    )
  }

  parseCallback(): UnverifiedCallback {
    throw new ConfigurationError(
      'Esewa parseCallback is not implemented',
      'NOT_IMPLEMENTED'
    )
  }

  async verify(): Promise<VerifiedPayment> {
    throw new ConfigurationError(
      'Esewa verify is not implemented',
      'NOT_IMPLEMENTED'
    )
  }

  async status(): Promise<VerifiedPayment> {
    throw new ConfigurationError(
      'Esewa status is not implemented',
      'NOT_IMPLEMENTED'
    )
  }
}

export * from './types.js'
