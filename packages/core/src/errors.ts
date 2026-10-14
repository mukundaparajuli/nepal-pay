export type PaymentErrorCode =
  | 'INVALID_ORDER'
  | 'INVALID_ORDER_ID'
  | 'INVALID_AMOUNT'
  | 'INVALID_STATUS'
  | 'INVALID_TXN_REF'
  | 'INVALID_MONEY'
  | 'INVALID_CURRENCY'
  | 'INVALID_PRECISION'
  | 'INVALID_DECIMAL'
  | 'UNSAFE_AMOUNT'
  | 'INVALID_URL'
  | 'INVALID_BASE64'
  | 'CURRENCY_MISMATCH'
  | 'PRECISION_MISMATCH'
  | 'MALFORMED_CALLBACK'
  | 'GATEWAY_MISMATCH'
  | 'ORDER_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'SIGNATURE_MISMATCH'
  | 'UNKNOWN_TRANSACTION'
  | 'UNVERIFIED_PAYMENT'
  | 'INVALID_RECONCILE_OPTIONS'
  | 'INVALID_IDEMPOTENCY_KEY'
  | 'NOT_IMPLEMENTED'

export class NepalPaymentsError extends Error {
  constructor(
    message: string,
    public readonly code?: PaymentErrorCode,
    public readonly details?: unknown
  ) {
    super(message)
  }
}

export class PaymentError extends NepalPaymentsError {
  constructor(message: string, code?: PaymentErrorCode, details?: unknown) {
    super(message, code, details)
    this.name = 'PaymentError'
  }
}

export class VerificationError extends NepalPaymentsError {
  constructor(message: string, code?: PaymentErrorCode, details?: unknown) {
    super(message, code, details)
    this.name = 'VerificationError'
  }
}

export class ConfigurationError extends NepalPaymentsError {
  constructor(message: string, code?: PaymentErrorCode, details?: unknown) {
    super(message, code, details)
    this.name = 'ConfigurationError'
  }
}

export class MoneyError extends NepalPaymentsError {
  constructor(message: string, code?: PaymentErrorCode, details?: unknown) {
    super(message, code, details)
    this.name = 'MoneyError'
  }
}
