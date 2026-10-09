export const PAYMENT_METHODS = [
  'esewa',
  'khalti',
  'connectips',
  'fonepay',
  'mock',
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return (
    typeof value === 'string' &&
    (PAYMENT_METHODS as readonly string[]).includes(value)
  )
}
