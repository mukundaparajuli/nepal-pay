import type {
  GatewayAdapter,
  CheckoutResult,
  VerifiedPayment,
  UnverifiedCallback,
  PaymentMethod,
} from '@nepal-payments/core'
import { ConfigurationError } from '@nepal-payments/core'
import type { KhaltiConfig } from './types.js'

export class KhaltiGateway implements GatewayAdapter {
  readonly name: PaymentMethod = 'khalti'

  constructor(private readonly config: KhaltiConfig) {
    if (!config.secretKey) {
      throw new ConfigurationError('Secret key is required')
    }
  }

  async createCheckout(): Promise<CheckoutResult> {
    throw new ConfigurationError(
      'Khalti createCheckout is not implemented',
      'NOT_IMPLEMENTED'
    )
  }

  parseCallback(): UnverifiedCallback {
    throw new ConfigurationError(
      'Khalti parseCallback is not implemented',
      'NOT_IMPLEMENTED'
    )
  }

  async verify(): Promise<VerifiedPayment> {
    throw new ConfigurationError(
      'Khalti verify is not implemented',
      'NOT_IMPLEMENTED'
    )
  }

  async status(): Promise<VerifiedPayment> {
    throw new ConfigurationError(
      'Khalti status is not implemented',
      'NOT_IMPLEMENTED'
    )
  }
}

export * from './types.js'
