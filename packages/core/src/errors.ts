export const PAYMENT_ERROR_CODES = [
  'INVALID_ORDER',
  'INVALID_ORDER_ID',
  'INVALID_AMOUNT',
  'INVALID_STATUS',
  'INVALID_TXN_REF',
  'INVALID_MONEY',
  'INVALID_CURRENCY',
  'INVALID_PRECISION',
  'INVALID_DECIMAL',
  'UNSAFE_AMOUNT',
  'INVALID_URL',
  'INVALID_BASE64',
  'INVALID_KEY',
  'CURRENCY_MISMATCH',
  'PRECISION_MISMATCH',
  'MALFORMED_CALLBACK',
  'GATEWAY_MISMATCH',
  'ORDER_MISMATCH',
  'AMOUNT_MISMATCH',
  'SIGNATURE_MISMATCH',
  'UNKNOWN_TRANSACTION',
  'UNVERIFIED_PAYMENT',
  'INVALID_RECONCILE_OPTIONS',
  'INVALID_IDEMPOTENCY_KEY',
  'NOT_IMPLEMENTED',
] as const

export type PaymentErrorCode = (typeof PAYMENT_ERROR_CODES)[number]

export function isPaymentErrorCode(value: unknown): value is PaymentErrorCode {
  return (
    typeof value === 'string' &&
    (PAYMENT_ERROR_CODES as readonly string[]).includes(value)
  )
}

export class NepalPayError extends Error {
  constructor(
    message: string,
    public readonly code?: PaymentErrorCode,
    public readonly details?: unknown
  ) {
    super(message)
  }
}

export class PaymentError extends NepalPayError {
  constructor(message: string, code?: PaymentErrorCode, details?: unknown) {
    super(message, code, details)
    this.name = 'PaymentError'
  }
}

export class VerificationError extends NepalPayError {
  constructor(message: string, code?: PaymentErrorCode, details?: unknown) {
    super(message, code, details)
    this.name = 'VerificationError'
  }
}

export class ConfigurationError extends NepalPayError {
  constructor(message: string, code?: PaymentErrorCode, details?: unknown) {
    super(message, code, details)
    this.name = 'ConfigurationError'
  }
}

export class MoneyError extends NepalPayError {
  constructor(message: string, code?: PaymentErrorCode, details?: unknown) {
    super(message, code, details)
    this.name = 'MoneyError'
  }
}
