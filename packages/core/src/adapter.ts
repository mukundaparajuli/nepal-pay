import type { Order } from './order.js'
import type { Checkout } from './checkout.js'
import type { TxnRef } from './txref.js'
import type { VerifiedPayment } from './verified.js'
import type { UnverifiedCallback } from './callback.js'

export interface GatewayConfig {
  readonly sandbox?: boolean
  readonly [key: string]: unknown
}

export interface VerifyOptions {
  readonly [key: string]: unknown
}

export interface GatewayAdapter {
  readonly name: string
  initiate(order: Order): Promise<{ checkout: Checkout; txnRef: TxnRef }>
  verify(
    callback: UnverifiedCallback,
    options?: VerifyOptions
  ): Promise<VerifiedPayment>
}
