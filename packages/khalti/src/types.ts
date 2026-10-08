import type { GatewayConfig } from '@nepal-payments/core'

export interface KhaltiConfig extends GatewayConfig {
  readonly secretKey: string
  readonly publicKey?: string
  readonly callbackUrl?: string
  readonly returnUrl?: string
  readonly sandbox?: boolean
}
