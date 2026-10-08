import type {
  PaymentGateway,
  PaymentRequest,
  PaymentResponse,
  CallbackPayload,
  VerifyOptions,
  VerifiedPayment,
} from '@nepal-payments/core'
import { ConfigurationError } from '@nepal-payments/core'
import type { EsewaConfig } from './types.js'

export class EsewaGateway implements PaymentGateway {
  readonly name = 'esewa' as const

  constructor(private readonly config: EsewaConfig) {
    if (!config.merchantCode) {
      throw new ConfigurationError('Merchant code is required')
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
