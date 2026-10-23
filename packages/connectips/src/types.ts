import type { Order } from '@nepal-pay/core'

export type ConnectIpsEnvironment = 'sandbox' | 'production'

export interface ConnectIpsConfig {
  /** Merchant id issued by NCHL (form field MERCHANTID). */
  readonly merchantId: string
  /** App id issued by NCHL; also the Basic-auth user name (APPID). */
  readonly appId: string
  /** Application name shown on the payment page (APPNAME). */
  readonly appName: string
  /** Basic-auth password for the server-to-server APIs. */
  readonly password: string
  /** PKCS#8 (`-----BEGIN PRIVATE KEY-----`) RSA private key PEM from CREDITOR.pfx. */
  readonly privateKey: string
  readonly environment: ConnectIpsEnvironment
  /** Default REMARKS sent at checkout (max 50 chars). */
  readonly remarks?: string
  /** Default PARTICULARS sent at checkout (max 100 chars). */
  readonly particulars?: string
  readonly baseUrl?: string
  readonly loginUrl?: string
  readonly validationUrl?: string
  readonly txnDetailUrl?: string
  readonly timeoutMs?: number
  /** Clock override, primarily for deterministic tests. */
  readonly now?: () => Date
  readonly fetch?: typeof globalThis.fetch
}

export interface ResolvedConnectIpsConfig {
  readonly merchantId: string
  readonly appId: string
  readonly appName: string
  readonly password: string
  readonly privateKey: string
  readonly environment: ConnectIpsEnvironment
  readonly remarks?: string
  readonly particulars?: string
  readonly loginUrl: string
  readonly validationUrl: string
  readonly txnDetailUrl: string
  readonly timeoutMs: number
  readonly now: () => Date
  readonly fetch: typeof globalThis.fetch
}

export interface ConnectIpsCheckoutOptions {
  readonly remarks?: string
  readonly particulars?: string
}

export interface ConnectIpsCallbackPayload {
  readonly TXNID?: unknown
  readonly [key: string]: unknown
}

export interface ConnectIpsApiResponse {
  readonly status: string
  readonly statusDesc?: string
  readonly merchantId?: string | number
  readonly appId?: string
  readonly referenceId?: string
  readonly txnId?: string | number
  readonly txnAmt?: string | number
  readonly txnCrncy?: string | null
  readonly creditStatus?: string
  readonly [key: string]: unknown
}

export type ConnectIpsStatusOptions = {
  readonly expected?: Order
}
