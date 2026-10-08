import type { Money } from './money.js'
import { isMoney, isPositive } from './money.js'
import { PaymentError } from './errors.js'
import { isValidOrderId } from './utils.js'

export interface Order {
  readonly id: string
  readonly amount: Money
  readonly description?: string
  readonly productName?: string
  readonly customerName?: string
  readonly customerEmail?: string
  readonly customerPhone?: string
  readonly metadata?: Readonly<Record<string, string>>
  readonly returnUrl?: string
  readonly failureUrl?: string
  readonly callbackUrl?: string
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function createOrder(input: Order): Order {
  if (!isValidOrderId(input.id)) {
    throw new PaymentError('Invalid order id', 'INVALID_ORDER_ID')
  }
  if (!isMoney(input.amount)) {
    throw new PaymentError('Invalid order amount', 'INVALID_AMOUNT')
  }
  if (!isPositive(input.amount)) {
    throw new PaymentError('Order amount must be positive', 'INVALID_AMOUNT')
  }
  for (const [name, url] of [
    ['returnUrl', input.returnUrl],
    ['failureUrl', input.failureUrl],
    ['callbackUrl', input.callbackUrl],
  ] as const) {
    if (url !== undefined && !isValidHttpUrl(url)) {
      throw new PaymentError(`Invalid ${name}: ${String(url)}`, 'INVALID_URL')
    }
  }
  if (input.metadata !== undefined) {
    if (
      typeof input.metadata !== 'object' ||
      input.metadata === null ||
      Array.isArray(input.metadata)
    ) {
      throw new PaymentError('Order metadata must be a record', 'INVALID_ORDER')
    }
    for (const [key, value] of Object.entries(input.metadata)) {
      if (typeof value !== 'string') {
        throw new PaymentError(
          `Order metadata value for "${key}" must be a string`,
          'INVALID_ORDER'
        )
      }
    }
  }

  const order: Record<string, unknown> = { ...input }
  if (input.metadata !== undefined) {
    order.metadata = Object.freeze({ ...input.metadata })
  }
  return Object.freeze(order) as unknown as Order
}
