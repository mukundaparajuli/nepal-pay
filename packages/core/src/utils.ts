import { createHash, timingSafeEqual } from 'crypto'

export function toMoney(amount: number | string): { amount: string; currency: 'NPR' } {
  if (typeof amount === 'string') {
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      throw new Error('Amount must be a valid decimal with up to 2 decimal places')
    }
    return { amount, currency: 'NPR' as const }
  }
  return { amount: amount.toFixed(2), currency: 'NPR' as const }
}

export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  try {
    return timingSafeEqual(bufferA, bufferB)
  } catch {
    return false
  }
}

export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

export function safeBase64Encode(data: string): string {
  return Buffer.from(data).toString('base64')
}

export function safeBase64Decode(data: string): string {
  return Buffer.from(data, 'base64').toString('utf8')
}

export function isValidOrderId(orderId: string): boolean {
  return typeof orderId === 'string' && orderId.length > 0 && orderId.length <= 100
}
