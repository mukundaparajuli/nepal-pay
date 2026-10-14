import type { Order } from '@nepal-payments/core'

export type MockScenario =
  | 'success'
  | 'failed'
  | 'pending'
  | 'expired'
  | 'abandoned'
  | 'delayed'
  | 'duplicate'
  | 'timeout'
  | 'invalid-signature'

export type MockLedgerStatus =
  'initiated' | 'pending' | 'completed' | 'failed' | 'canceled' | 'expired'

export interface MockConfig {
  readonly secretKey: string
  readonly scenario?: MockScenario
  readonly checkoutUrl?: string
  readonly delayMs?: number
  readonly timeoutMs?: number
}

export interface ResolvedMockConfig {
  readonly secretKey: string
  readonly scenario: MockScenario
  readonly checkoutUrl: string
  readonly delayMs: number
  readonly timeoutMs: number
}

export interface MockLedgerEntry {
  readonly txnId: string
  readonly orderId: string
  readonly amount: bigint
  readonly status: MockLedgerStatus
  readonly createdAt: number
  readonly updatedAt: number
}

export interface MockCheckoutOptions {
  readonly scenario?: MockScenario
  readonly txnId?: string
  readonly user?: string
}

export interface MockStatusOptions {
  readonly expected?: Order
}

export interface MockCallbackPayload {
  readonly txn_id: unknown
  readonly order_id: unknown
  readonly amount: unknown
  readonly status: unknown
  readonly signature: unknown
  readonly user?: unknown
}
