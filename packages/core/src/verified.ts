import type { Money } from './money.js'
import { isMoney } from './money.js'
import type { TxnRef } from './txref.js'
import type { PaymentStatus } from './status.js'
import { isPaymentStatus } from './status.js'
import { isPaymentMethod } from './method.js'
import { PaymentError } from './errors.js'
import { isValidOrderId } from './utils.js'

const verifiedPaymentBrand: unique symbol = Symbol(
  'nepal-payments.verified-payment'
)

export interface VerifiedPayment {
  readonly [verifiedPaymentBrand]: true
  readonly orderId: string
  readonly amount: Money
  readonly status: PaymentStatus
  readonly txnRef: TxnRef
  readonly verifiedAt: Date
  readonly raw?: Record<string, unknown>
}

export interface VerifiedPaymentInput {
  readonly __unverified: true
  readonly orderId: string
  readonly amount: Money
  readonly status: PaymentStatus
  readonly txnRef: TxnRef
  readonly raw?: Record<string, unknown>
}

function isTxnRef(value: unknown): value is TxnRef {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { id?: unknown; gateway?: unknown }
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    isPaymentMethod(candidate.gateway)
  )
}

function isRawRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value)
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}

function cloneAndFreezeRaw(
  raw: Record<string, unknown>
): Record<string, unknown> {
  let cloned: Record<string, unknown>
  try {
    cloned = structuredClone(raw)
  } catch {
    throw new PaymentError(
      'Verified payment raw data must be structured-cloneable'
    )
  }
  return deepFreeze(cloned)
}

export function createVerifiedPayment(
  input: VerifiedPaymentInput
): VerifiedPayment {
  if (input.__unverified !== true) {
    throw new PaymentError(
      'Verified payment input must carry the __unverified marker'
    )
  }
  if (!isValidOrderId(input.orderId)) {
    throw new PaymentError(
      'Verified payment requires a valid orderId',
      'INVALID_ORDER_ID'
    )
  }
  if (!isMoney(input.amount)) {
    throw new PaymentError(
      'Verified payment requires a valid Money amount',
      'INVALID_AMOUNT'
    )
  }
  if (input.amount.amount <= 0n) {
    throw new PaymentError(
      'Verified payment amount must be positive',
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

  const payment: Record<string, unknown> = {
    orderId: input.orderId,
    amount: Object.freeze({ ...input.amount }),
    status: input.status,
    txnRef: Object.freeze({ ...input.txnRef }),
    verifiedAt: Object.freeze(new Date()),
  }
  if (input.raw !== undefined) {
    if (!isRawRecord(input.raw)) {
      throw new PaymentError('Verified payment raw data must be a plain object')
    }
    payment.raw = cloneAndFreezeRaw(input.raw)
  }

  Object.defineProperty(payment, verifiedPaymentBrand, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  })
  Object.freeze(payment)
  return payment as unknown as VerifiedPayment
}

export function isVerifiedPayment(value: unknown): value is VerifiedPayment {
  if (typeof value !== 'object' || value === null) return false
  const descriptor = Object.getOwnPropertyDescriptor(
    value,
    verifiedPaymentBrand
  )
  if (descriptor === undefined) return false
  return (
    descriptor.value === true &&
    descriptor.enumerable === false &&
    descriptor.writable === false &&
    descriptor.configurable === false
  )
}

export function isCompletedPayment(value: unknown): boolean {
  return isVerifiedPayment(value) && value.status === 'completed'
}
