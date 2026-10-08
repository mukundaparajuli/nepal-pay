import type { Order } from '@nepal-payments/core'
import type { Money } from '@nepal-payments/core'

export type EsewaEnvironment = 'sandbox' | 'production'

export interface EsewaConfig {
  readonly merchantCode: string
  readonly secret: string
  readonly environment: EsewaEnvironment
  readonly successUrl?: string
  readonly failureUrl?: string
  readonly checkoutFormUrl?: string
  readonly statusCheckUrl?: string
  readonly timeoutMs?: number
  readonly fetch?: typeof globalThis.fetch
}

export interface CheckoutSurcharges {
  readonly tax?: Money | string
  readonly serviceCharge?: Money | string
  readonly deliveryCharge?: Money | string
}

export interface EsewaCheckoutOptions {
  readonly surcharges?: CheckoutSurcharges
  readonly successUrl?: string
  readonly failureUrl?: string
}

export interface ResolvedEsewaConfig {
  readonly merchantCode: string
  readonly secret: string
  readonly environment: EsewaEnvironment
  readonly successUrl?: string
  readonly failureUrl?: string
  readonly checkoutFormUrl: string
  readonly statusCheckUrl: string
  readonly timeoutMs: number
  readonly fetch: typeof globalThis.fetch
}

export type EsewaStatusOptions = {
  readonly expected?: Order
}

export interface EsewaCallbackPayload {
  readonly status?: unknown
  readonly signature?: unknown
  readonly transaction_code?: unknown
  readonly total_amount?: unknown
  readonly transaction_uuid?: unknown
  readonly product_code?: unknown
  readonly success_url?: unknown
  readonly signed_field_names?: unknown
  readonly [key: string]: unknown
}
