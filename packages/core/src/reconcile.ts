import type { GatewayAdapter } from './adapter.js'
import type { Order } from './order.js'
import type { TxnRef } from './txref.js'
import type { PaymentStatus } from './status.js'
import type { VerifiedPayment } from './verified.js'
import { PaymentError } from './errors.js'

/**
 * The statuses that end a payment's lifecycle. A reconciliation run stops as
 * soon as one of these is observed.
 */
export const TERMINAL_PAYMENT_STATUSES = [
  'completed',
  'failed',
  'canceled',
  'expired',
] as const

export type TerminalPaymentStatus = (typeof TERMINAL_PAYMENT_STATUSES)[number]

export function isTerminalPaymentStatus(
  value: unknown
): value is TerminalPaymentStatus {
  return (
    typeof value === 'string' &&
    (TERMINAL_PAYMENT_STATUSES as readonly string[]).includes(value)
  )
}

/**
 * The minimum needed to reconcile: the order we expect and the transaction
 * reference the gateway gave us at checkout. Persist both together.
 */
export interface PendingPayment {
  readonly order: Order
  readonly txnRef: TxnRef
}

/** Why a reconciliation run stopped. */
export type ReconcileReason =
  | 'terminal' // reached a terminal status
  | 'exhausted' // ran out of attempts while still pending/unknown
  | 'timeout' // exceeded the total time budget
  | 'expired' // reached the payment expiry deadline

export interface ReconcileOptions {
  /** How many status lookups to make in total (default 3). */
  readonly maxAttempts?: number
  /** Base backoff between attempts in milliseconds (default 250). */
  readonly backoffMs?: number
  /** Upper bound for exponential backoff in milliseconds (default 5000). */
  readonly maxBackoffMs?: number
  /** Total time budget for the whole run in milliseconds (default 10000). */
  readonly timeoutMs?: number
  /** Stop retrying once this instant is reached (checked after each lookup). */
  readonly expiresAt?: Date
  /** Injectable clock, in epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number
  /** Injectable sleep. Defaults to `setTimeout`. */
  readonly sleep?: (ms: number) => Promise<void>
  /**
   * Retry when `status()` throws (transient network errors). Defaults to true.
   * Set to false to surface the first error immediately. If every attempt
   * errors and none returns a payment, the last error is rethrown either way.
   */
  readonly retryOnError?: boolean
}

export interface ReconcileResult {
  /** The last payment observed (terminal, or pending/unknown when unresolved). */
  readonly payment: VerifiedPayment
  readonly status: PaymentStatus
  /** Number of status lookups performed. */
  readonly attempts: number
  /** True when a terminal status was reached. */
  readonly resolved: boolean
  readonly reason: ReconcileReason
}

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BACKOFF_MS = 250
const DEFAULT_MAX_BACKOFF_MS = 5_000
const DEFAULT_TIMEOUT_MS = 10_000

interface NormalizedOptions {
  readonly maxAttempts: number
  readonly backoffMs: number
  readonly maxBackoffMs: number
  readonly timeoutMs: number
  readonly expiresAt: number | undefined
  readonly now: () => number
  readonly sleep: (ms: number) => Promise<void>
  readonly retryOnError: boolean
}

function invalidOptions(message: string): PaymentError {
  return new PaymentError(
    `Invalid reconcile options: ${message}`,
    'INVALID_RECONCILE_OPTIONS'
  )
}

function normalize(options: ReconcileOptions | undefined): NormalizedOptions {
  const source = options ?? {}
  const maxAttempts = source.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw invalidOptions('maxAttempts must be a positive integer')
  }
  const backoffMs = source.backoffMs ?? DEFAULT_BACKOFF_MS
  if (!Number.isFinite(backoffMs) || backoffMs < 0) {
    throw invalidOptions('backoffMs must be a non-negative number')
  }
  const maxBackoffMs = source.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS
  if (!Number.isFinite(maxBackoffMs) || maxBackoffMs < 0) {
    throw invalidOptions('maxBackoffMs must be a non-negative number')
  }
  const timeoutMs = source.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw invalidOptions('timeoutMs must be a non-negative number')
  }
  let expiresAt: number | undefined
  if (source.expiresAt !== undefined) {
    const value = source.expiresAt.getTime()
    if (Number.isNaN(value)) {
      throw invalidOptions('expiresAt must be a valid Date')
    }
    expiresAt = value
  }
  return {
    maxAttempts,
    backoffMs,
    maxBackoffMs,
    timeoutMs,
    expiresAt,
    now: source.now ?? Date.now,
    sleep: source.sleep ?? defaultSleep,
    retryOnError: source.retryOnError ?? true,
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffDelay(
  attempt: number,
  backoffMs: number,
  maxBackoffMs: number
): number {
  if (backoffMs === 0) return 0
  const delay = backoffMs * 2 ** (attempt - 1)
  return Math.min(delay, maxBackoffMs)
}

/**
 * Look up the current status of a pending payment, retrying while it is
 * non-terminal (`pending` / `unknown`) or the lookup fails transiently.
 *
 * This performs one bounded run with exponential backoff — it does not
 * schedule itself. Wire it to a cron, queue, or background job on your side.
 *
 * Terminal statuses (`completed`, `failed`, `canceled`, `expired`) stop the run
 * immediately. Otherwise it stops when attempts, `timeoutMs`, or `expiresAt`
 * are reached and returns the last observed payment with `resolved: false`.
 */
export async function reconcile(
  gateway: GatewayAdapter,
  payment: PendingPayment,
  options?: ReconcileOptions
): Promise<ReconcileResult> {
  const opts = normalize(options)
  const startedAt = opts.now()
  const deadline = startedAt + opts.timeoutMs

  let attempts = 0
  let lastPayment: VerifiedPayment | undefined
  let lastError: unknown

  for (;;) {
    attempts += 1
    try {
      lastPayment = await gateway.status(payment.txnRef, {
        expected: payment.order,
      })
      lastError = undefined
    } catch (error) {
      lastError = error
      if (!opts.retryOnError) throw error
    }

    if (
      lastPayment !== undefined &&
      isTerminalPaymentStatus(lastPayment.status)
    ) {
      return {
        payment: lastPayment,
        status: lastPayment.status,
        attempts,
        resolved: true,
        reason: 'terminal',
      }
    }

    const now = opts.now()
    const noMoreAttempts = attempts >= opts.maxAttempts
    const timedOut = now >= deadline
    const expired = opts.expiresAt !== undefined && now >= opts.expiresAt

    if (noMoreAttempts || timedOut || expired) {
      if (lastPayment === undefined) {
        throw lastError
      }
      const reason: ReconcileReason = noMoreAttempts
        ? 'exhausted'
        : timedOut
          ? 'timeout'
          : 'expired'
      return {
        payment: lastPayment,
        status: lastPayment.status,
        attempts,
        resolved: false,
        reason,
      }
    }

    let delay = backoffDelay(attempts, opts.backoffMs, opts.maxBackoffMs)
    const budget = Math.min(
      deadline - now,
      opts.expiresAt !== undefined ? opts.expiresAt - now : Infinity
    )
    if (delay > budget) delay = Math.max(0, budget)
    await opts.sleep(delay)
  }
}
