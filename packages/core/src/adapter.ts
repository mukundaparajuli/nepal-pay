import type { Order } from './order.js'
import type { Checkout } from './checkout.js'
import type { TxnRef } from './txref.js'
import type { VerifiedPayment } from './verified.js'
import type { RawCallbackRequest, UnverifiedCallback } from './callback.js'
import type { PaymentMethod } from './method.js'

export interface GatewayConfig {
  readonly sandbox?: boolean
  readonly [key: string]: unknown
}

export interface VerifyOptions {
  readonly expected: Order
  readonly [key: string]: unknown
}

export interface StatusOptions {
  readonly [key: string]: unknown
}

export interface CheckoutResult {
  readonly checkout: Checkout
  readonly txnRef: TxnRef
}

export interface GatewayAdapter {
  readonly name: PaymentMethod
  createCheckout(order: Order): Promise<CheckoutResult>
  parseCallback(request: RawCallbackRequest): UnverifiedCallback
  verify(
    callback: UnverifiedCallback,
    options: VerifyOptions
  ): Promise<VerifiedPayment>
  status(txnRef: TxnRef, options?: StatusOptions): Promise<VerifiedPayment>
}
