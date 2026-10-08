export type Currency = 'NPR'

export type PaymentMethod = 'esewa' | 'khalti'

export interface Money {
  readonly amount: string
  readonly currency: Currency
}

export interface PaymentRequest {
  readonly orderId: string
  readonly amount: Money
  readonly productName: string
  readonly productDescription?: string
  readonly customerName?: string
  readonly customerEmail?: string
  readonly customerPhone?: string
  readonly returnUrl: string
  readonly failureUrl: string
  readonly callbackUrl?: string
  readonly metadata?: Record<string, unknown>
}

export interface PaymentResponse {
  readonly paymentUrl: string
  readonly transactionId?: string
  readonly raw?: Record<string, unknown>
}

export interface VerifiedPayment {
  readonly orderId: string
  readonly transactionId: string
  readonly amount: Money
  readonly status: 'success' | 'failed' | 'pending'
  readonly method: PaymentMethod
  readonly raw: Record<string, unknown>
}

export interface CallbackPayload {
  [key: string]: unknown
}

export interface VerifyOptions {
  [key: string]: unknown
}

export interface GatewayConfig {
  [key: string]: unknown
}

export interface PaymentGateway {
  readonly name: PaymentMethod
  initiate(request: PaymentRequest): Promise<PaymentResponse>
  verify(payload: CallbackPayload, options?: VerifyOptions): Promise<VerifiedPayment>
}
