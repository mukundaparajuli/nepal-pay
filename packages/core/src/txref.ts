import type { PaymentMethod } from './method.js'

export interface TxnRef {
  readonly id: string
  readonly gateway: PaymentMethod
}
