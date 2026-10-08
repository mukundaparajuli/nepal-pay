import type { GatewayConfig } from '@nepal-payments/core'

export interface EsewaConfig extends GatewayConfig {
  readonly merchantCode: string
  readonly merchantSecret?: string
  readonly successUrl?: string
  readonly failureUrl?: string
  readonly callbackUrl?: string
  readonly sandbox?: boolean
}
