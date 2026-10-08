import type { Money } from './money.js'
import type { TxnRef } from './txref.js'

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded' | 'expired'

export interface VerifiedPayment {
  readonly orderId: string
  readonly amount: Money
  readonly status: PaymentStatus
  readonly txnRef: TxnRef
  readonly raw?: Record<string, unknown>
}
