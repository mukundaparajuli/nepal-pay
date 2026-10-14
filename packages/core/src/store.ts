import type { Money } from './money.js'
import type { PaymentStatus } from './status.js'
import type { TxnRef } from './txref.js'
import type { VerifiedPayment } from './verified.js'
import { isVerifiedPayment } from './verified.js'
import { PaymentError } from './errors.js'
import { isValidOrderId } from './utils.js'

/**
 * A persistence-friendly snapshot of a payment. Unlike {@link VerifiedPayment}
 * it is a plain object (no seal), so it can be serialized and stored.
 *
 * Persist at least `orderId`, `txnRef`, `amount`, and `status`; reconciliation
 * needs `orderId`, `txnRef`, and the expected `amount` back.
 */
export interface Payment {
  readonly orderId: string
  readonly amount: Money
  readonly status: PaymentStatus
  readonly txnRef: TxnRef
  readonly verifiedAt: Date
  readonly updatedAt: Date
  readonly raw?: Record<string, unknown>
}

/**
 * The optional persistence contract. The SDK ships no database; implement this
 * against whatever you already use (Postgres, Redis, DynamoDB, a file…).
 * The in-memory implementation is for tests and local development only.
 */
export interface PaymentStore {
  /** Return the stored payment for an order, or `null` if none exists. */
  getPayment(orderId: string): Promise<Payment | null>

  /** Insert or update the payment for `payment.orderId`. */
  savePayment(payment: Payment): Promise<void>

  /**
   * Atomically claim an idempotency key. Resolve `true` when this caller
   * claimed it, `false` when it was already claimed (i.e. a replay). Must be
   * safe to call concurrently.
   */
  acquireIdempotencyKey(key: string): Promise<boolean>
}

function cloneRaw(raw: Record<string, unknown>): Record<string, unknown> {
  try {
    return structuredClone(raw)
  } catch {
    return { ...raw }
  }
}

function clonePayment(payment: Payment): Payment {
  const clone: Payment = {
    orderId: payment.orderId,
    amount: Object.freeze({ ...payment.amount }),
    status: payment.status,
    txnRef: Object.freeze({ ...payment.txnRef }),
    verifiedAt: new Date(payment.verifiedAt.getTime()),
    updatedAt: new Date(payment.updatedAt.getTime()),
  }
  if (payment.raw !== undefined) {
    return Object.freeze({
      ...clone,
      raw: Object.freeze(cloneRaw(payment.raw)),
    })
  }
  return Object.freeze(clone)
}

function assertValidPayment(payment: Payment): void {
  if (!isValidOrderId(payment.orderId)) {
    throw new PaymentError(
      'Stored payment requires a valid orderId',
      'INVALID_ORDER_ID'
    )
  }
  if (
    typeof payment.txnRef !== 'object' ||
    payment.txnRef === null ||
    typeof payment.txnRef.id !== 'string' ||
    payment.txnRef.id.length === 0
  ) {
    throw new PaymentError(
      'Stored payment requires a valid txnRef',
      'INVALID_TXN_REF'
    )
  }
}

/**
 * Build a storable {@link Payment} from a sealed {@link VerifiedPayment}.
 * Rejects anything that is not a verified payment, so unverified data can
 * never be persisted as a payment.
 */
export function paymentFromVerified(
  payment: VerifiedPayment,
  now: Date = new Date()
): Payment {
  if (!isVerifiedPayment(payment)) {
    throw new PaymentError(
      'Only a VerifiedPayment can be stored as a payment',
      'UNVERIFIED_PAYMENT'
    )
  }
  return clonePayment({
    orderId: payment.orderId,
    amount: payment.amount,
    status: payment.status,
    txnRef: payment.txnRef,
    verifiedAt: payment.verifiedAt,
    updatedAt: now,
    ...(payment.raw !== undefined ? { raw: payment.raw } : {}),
  })
}

/**
 * In-memory {@link PaymentStore} for tests and local development. State is
 * process-local and lost on restart — do not use it in production.
 */
export class InMemoryPaymentStore implements PaymentStore {
  private readonly payments = new Map<string, Payment>()
  private readonly idempotencyKeys = new Set<string>()

  async getPayment(orderId: string): Promise<Payment | null> {
    const found = this.payments.get(orderId)
    return found === undefined ? null : clonePayment(found)
  }

  async savePayment(payment: Payment): Promise<void> {
    assertValidPayment(payment)
    this.payments.set(payment.orderId, clonePayment(payment))
  }

  async acquireIdempotencyKey(key: string): Promise<boolean> {
    if (typeof key !== 'string' || key.length === 0) {
      throw new PaymentError(
        'Idempotency key must be a non-empty string',
        'INVALID_IDEMPOTENCY_KEY'
      )
    }
    if (this.idempotencyKeys.has(key)) return false
    this.idempotencyKeys.add(key)
    return true
  }

  /** Remove all payments and idempotency keys. Useful between tests. */
  clear(): void {
    this.payments.clear()
    this.idempotencyKeys.clear()
  }
}

export function createInMemoryPaymentStore(): InMemoryPaymentStore {
  return new InMemoryPaymentStore()
}
