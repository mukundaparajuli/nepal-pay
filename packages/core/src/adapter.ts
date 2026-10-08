import type { Order } from './order.js'
import type { Checkout } from './checkout.js'
import type { TxnRef } from './txref.js'
import type { VerifiedPayment } from './verified.js'
import type { UnverifiedCallback } from './callback.js'

export interface GatewayAdapter {
  readonly name: string
  initiate(order: Order): Promise<{ checkout: Checkout; txnRef: TxnRef }>
  verify(callback: UnverifiedCallback): Promise<VerifiedPayment>
}
