import type {
  PaymentGateway,
  PaymentRequest,
  PaymentResponse,
  CallbackPayload,
  VerifyOptions,
  VerifiedPayment,
} from '@nepal-payments/core'
import { ConfigurationError } from '@nepal-payments/core'
import type { KhaltiConfig } from './types.js'

export class KhaltiGateway implements PaymentGateway {
  readonly name = 'khalti' as const

  constructor(private readonly config: KhaltiConfig) {
    if (!config.secretKey) {
      throw new ConfigurationError('Secret key is required')
    }
  }

  async initiate(request: PaymentRequest): Promise<PaymentResponse> {
    return {
      paymentUrl: '',
      transactionId: undefined,
      raw: {},
    }
  }

  async verify(payload: CallbackPayload, _options?: VerifyOptions): Promise<VerifiedPayment> {
    throw new Error('Not implemented')
  }
}

export * from './types.js'
