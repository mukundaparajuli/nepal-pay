import type { Order } from '@nepal-pay/core'
import { createMockGateway, type MockGateway } from '@nepal-pay/mock'

export const EXAMPLE_MOCK_SECRET = 'next-example-dev-secret'

export interface ExampleStore {
  readonly orders: Map<string, Order>
  readonly txnToOrder: Map<string, string>
  readonly fulfilled: Set<string>
}

export const store: ExampleStore = {
  orders: new Map(),
  txnToOrder: new Map(),
  fulfilled: new Set(),
}

let gateway: MockGateway | undefined

export function getGateway(): MockGateway {
  if (gateway === undefined) {
    gateway = createMockGateway({ secretKey: EXAMPLE_MOCK_SECRET })
  }
  return gateway
}
