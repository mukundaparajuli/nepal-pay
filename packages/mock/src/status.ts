import type { PaymentStatus } from '@nepal-payments/core'
import type { MockLedgerStatus } from './types.js'

const STATUS_MAP: Readonly<Record<MockLedgerStatus, PaymentStatus>> = {
  initiated: 'pending',
  pending: 'pending',
  completed: 'completed',
  failed: 'failed',
  canceled: 'canceled',
  expired: 'expired',
}

export function mapMockStatus(
  status: unknown
): 'completed' | 'failed' | 'pending' | 'canceled' | 'expired' | 'unknown' {
  if (typeof status !== 'string') return 'unknown'
  const entry = STATUS_MAP[status as MockLedgerStatus]
  return entry ?? 'unknown'
}
