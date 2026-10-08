import type { Money } from './money.js'
import type { TxnRef } from './txref.js'
import type { PaymentStatus } from './status.js'
import { isPaymentStatus } from './status.js'
import { PaymentError } from './errors.js'

const verifiedPaymentBrand: unique symbol = Symbol(
  'nepal-payments.verified-payment'
)

export interface VerifiedPayment {
  readonly [verifiedPaymentBrand]: true
  readonly orderId: string
  readonly amount: Money
  readonly status: PaymentStatus
  readonly txnRef: TxnRef
  readonly raw?: Record<string, unknown>
}

export interface VerifiedPaymentInput {
  readonly orderId: string
  readonly amount: Money
  readonly status: PaymentStatus
  readonly txnRef: TxnRef
  readonly raw?: Record<string, unknown>
}

function isMoney(value: unknown): value is Money {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as {
    amount?: unknown
    currency?: unknown
    precision?: unknown
  }
  return (
    typeof candidate.amount === 'bigint' &&
    candidate.currency === 'NPR' &&
    typeof candidate.precision === 'number'
  )
}

function isTxnRef(value: unknown): value is TxnRef {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { id?: unknown; gateway?: unknown }
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.gateway === 'string' &&
    candidate.gateway.length > 0
  )
}

export function createVerifiedPayment(
  input: VerifiedPaymentInput
): VerifiedPayment {
  if (typeof input.orderId !== 'string' || input.orderId.length === 0) {
    throw new PaymentError(
      'Verified payment requires a non-empty orderId',
      'INVALID_ORDER_ID'
    )
  }
  if (!isMoney(input.amount)) {
    throw new PaymentError(
      'Verified payment requires a valid Money amount',
      'INVALID_AMOUNT'
    )
  }
  if (!isPaymentStatus(input.status)) {
    throw new PaymentError(
      `Invalid payment status: ${String(input.status)}`,
      'INVALID_STATUS'
    )
  }
  if (!isTxnRef(input.txnRef)) {
    throw new PaymentError(
      'Verified payment requires a valid txnRef',
      'INVALID_TXN_REF'
    )
  }
  return { ...input, [verifiedPaymentBrand]: true }
}

export function isVerifiedPayment(value: unknown): value is VerifiedPayment {
  if (typeof value !== 'object' || value === null) return false
  return (value as Record<symbol, unknown>)[verifiedPaymentBrand] === true
}
