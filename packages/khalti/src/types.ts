import type { Order } from '@nepal-pay/core'

export type KhaltiEnvironment = 'sandbox' | 'production'

export interface KhaltiConfig {
  readonly secretKey: string
  readonly environment: KhaltiEnvironment
  readonly returnUrl?: string
  readonly websiteUrl?: string
  readonly initiateUrl?: string
  readonly lookupUrl?: string
  readonly timeoutMs?: number
  readonly fetch?: typeof globalThis.fetch
}

export interface ResolvedKhaltiConfig {
  readonly secretKey: string
  readonly environment: KhaltiEnvironment
  readonly returnUrl?: string
  readonly websiteUrl?: string
  readonly initiateUrl: string
  readonly lookupUrl: string
  readonly timeoutMs: number
  readonly fetch: typeof globalThis.fetch
}

export interface KhaltiCheckoutOptions {
  readonly returnUrl?: string
  readonly websiteUrl?: string
  readonly purchaseOrderName?: string
}

export interface KhaltiInitiateRequest {
  readonly return_url: string
  readonly website_url: string
  readonly amount: number
  readonly purchase_order_id: string
  readonly purchase_order_name: string
  readonly customer_info?: {
    readonly name?: string
    readonly email?: string
    readonly phone?: string
  }
}

export interface KhaltiInitiateResponse {
  readonly pidx: string
  readonly payment_url: string
  readonly expires_at?: string
  readonly expires_in?: number
}

export interface KhaltiCallbackPayload {
  readonly pidx: string
  readonly status?: string
  readonly transaction_id?: string
  readonly tidx?: string
  readonly amount?: string
  readonly total_amount?: string
  readonly mobile?: string
  readonly purchase_order_id?: string
  readonly purchase_order_name?: string
  readonly message?: string
  readonly [key: string]: unknown
}

export interface KhaltiLookupResponse {
  readonly pidx: string
  readonly total_amount: number
  readonly status: string
  readonly transaction_id: string | null
  readonly fee: number | null
  readonly refunded: boolean
  readonly purchase_order_id?: string
  readonly [key: string]: unknown
}

export type KhaltiStatusOptions = {
  readonly expected?: Order
}
