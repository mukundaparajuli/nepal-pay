import type { Checkout, Order, TxnRef } from '@nepal-pay/core'

export type FonepayEnvironment = 'sandbox' | 'production'

export interface FonepayConfig {
  /** Merchant code (PID) issued by the Fonepay partner bank. */
  readonly merchantCode: string
  /** HMAC-SHA512 shared secret used to sign requests and callbacks (DV). */
  readonly secretKey: string
  readonly environment: FonepayEnvironment
  /** Fallback redirect URL (RU) when neither options nor the order provide one. */
  readonly returnUrl?: string
  /** Fallback first remark (R1). */
  readonly remarks1?: string
  /** Fallback second remark (R2); defaults to `N/A`. */
  readonly remarks2?: string
  /**
   * Call the server-to-server `verificationMerchant` API during `verify()` when
   * the callback claims success. Defaults to `true`; set `false` for a
   * DV-only integration.
   */
  readonly serverVerification?: boolean
  readonly requestUrl?: string
  readonly verificationUrl?: string
  readonly timeoutMs?: number
  /** Clock override, primarily for deterministic tests. */
  readonly now?: () => Date
  readonly fetch?: typeof globalThis.fetch
}

export interface ResolvedFonepayConfig {
  readonly merchantCode: string
  readonly secretKey: string
  readonly environment: FonepayEnvironment
  readonly returnUrl?: string
  readonly remarks1?: string
  readonly remarks2?: string
  readonly serverVerification: boolean
  readonly requestUrl: string
  readonly verificationUrl: string
  readonly timeoutMs: number
  readonly now: () => Date
  readonly fetch: typeof globalThis.fetch
}

export interface FonepayCheckoutOptions {
  readonly returnUrl?: string
  readonly remarks1?: string
  readonly remarks2?: string
}

export interface FonepayCallbackPayload {
  readonly PRN?: unknown
  readonly PID?: unknown
  readonly PS?: unknown
  readonly RC?: unknown
  readonly UID?: unknown
  readonly BC?: unknown
  readonly INI?: unknown
  readonly P_AMT?: unknown
  readonly R_AMT?: unknown
  readonly DV?: unknown
  readonly [key: string]: unknown
}

export interface FonepayStatusOptions {
  readonly expected?: Order
  /** Bank code (BC) to echo to `verificationMerchant`, when known. */
  readonly bankCode?: string
}

export interface FonepayCheckout {
  readonly checkout: Checkout
  readonly txnRef: TxnRef
}
