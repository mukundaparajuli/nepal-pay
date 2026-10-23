import { createOrder, moneyFromDecimal, type Order } from '@nepal-pay/core'
import {
  createMockGateway,
  type MockConfig,
  type MockGateway,
} from '@nepal-pay/mock'

export const MOCK_SECRET = 'mock-secret-key-123'
export const MOCK_TXN_ID = 'mock_9f86d081884c7d65'

export function order(overrides: Partial<Order> = {}): Order {
  return createOrder({
    id: 'ORD-MOCK-1',
    amount: moneyFromDecimal('230.00'),
    ...overrides,
  })
}

export function mockGateway(overrides: Partial<MockConfig> = {}): MockGateway {
  return createMockGateway({
    secretKey: MOCK_SECRET,
    scenario: 'success',
    ...overrides,
  })
}

export async function captureError(
  fn: () => unknown | Promise<unknown>
): Promise<unknown> {
  try {
    await fn()
    return undefined
  } catch (error) {
    return error
  }
}

export function isAbortError(error: unknown): boolean {
  return typeof DOMException !== 'undefined' && error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}
