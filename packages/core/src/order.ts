import type { Money } from './money.js'

export interface Order {
  readonly id: string
  readonly amount: Money
  readonly description?: string
}
