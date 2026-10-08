export const PAYMENT_STATUSES = [
  'pending',
  'completed',
  'failed',
  'canceled',
  'expired',
  'unknown',
] as const

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return (
    typeof value === 'string' &&
    (PAYMENT_STATUSES as readonly string[]).includes(value)
  )
}
