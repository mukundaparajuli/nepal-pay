import { PAYMENT_METHODS, type PaymentMethod } from '@nepal-payments/core'

export interface GatewayEnvVar {
  readonly name: string
  readonly description: string
  /** Printed without a value hint; never echoed back. */
  readonly secret?: boolean
  /** Not required to construct the gateway. */
  readonly optional?: boolean
}

export interface GatewayDescriptor {
  readonly method: PaymentMethod
  readonly title: string
  readonly env: readonly GatewayEnvVar[]
}

/**
 * The environment variables the CLI understands for each gateway. The SDK
 * itself never reads the environment — this mapping is only used by `npay init`
 * and `npay gateway test`, which build a gateway config from the process env.
 */
export const GATEWAY_DESCRIPTORS: Record<PaymentMethod, GatewayDescriptor> = {
  esewa: {
    method: 'esewa',
    title: 'eSewa (ePay V2)',
    env: [
      { name: 'ESEWA_MERCHANT_CODE', description: 'Merchant/product code' },
      { name: 'ESEWA_SECRET', description: 'HMAC secret key', secret: true },
      {
        name: 'ESEWA_ENVIRONMENT',
        description: 'sandbox | production',
        optional: true,
      },
    ],
  },
  khalti: {
    method: 'khalti',
    title: 'Khalti (ePayment)',
    env: [
      { name: 'KHALTI_SECRET_KEY', description: 'Secret key', secret: true },
      { name: 'KHALTI_RETURN_URL', description: 'Return URL after payment' },
      {
        name: 'KHALTI_ENVIRONMENT',
        description: 'sandbox | production',
        optional: true,
      },
    ],
  },
  connectips: {
    method: 'connectips',
    title: 'NCHL connectIPS',
    env: [
      {
        name: 'CONNECTIPS_MERCHANT_ID',
        description: 'Merchant id (MERCHANTID)',
      },
      { name: 'CONNECTIPS_APP_ID', description: 'App id / Basic-auth user' },
      {
        name: 'CONNECTIPS_APP_NAME',
        description: 'Application name (APPNAME)',
      },
      {
        name: 'CONNECTIPS_PASSWORD',
        description: 'Basic-auth password',
        secret: true,
      },
      {
        name: 'CONNECTIPS_PRIVATE_KEY_PATH',
        description: 'Path to the PKCS#8 private key PEM',
        secret: true,
        optional: true,
      },
      {
        name: 'CONNECTIPS_PRIVATE_KEY_PEM',
        description: 'PKCS#8 private key PEM (alternative to _PATH)',
        secret: true,
        optional: true,
      },
      {
        name: 'CONNECTIPS_ENVIRONMENT',
        description: 'sandbox | production',
        optional: true,
      },
    ],
  },
  fonepay: {
    method: 'fonepay',
    title: 'Fonepay',
    env: [
      { name: 'FONEPAY_PID', description: 'Merchant id (PID)' },
      {
        name: 'FONEPAY_SECRET_KEY',
        description: 'DV secret key',
        secret: true,
      },
      { name: 'FONEPAY_RETURN_URL', description: 'Return URL after payment' },
      {
        name: 'FONEPAY_ENVIRONMENT',
        description: 'sandbox | production',
        optional: true,
      },
    ],
  },
  mock: {
    method: 'mock',
    title: 'Local mock gateway',
    env: [
      {
        name: 'NPAY_MOCK_SECRET',
        description: 'Mock signing secret',
        secret: true,
        optional: true,
      },
    ],
  },
}

export const DEFAULT_INIT_GATEWAYS: readonly PaymentMethod[] = [
  'esewa',
  'khalti',
  'connectips',
  'fonepay',
]

export function isGatewayMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value)
}

export function parseGatewayList(value: string): PaymentMethod[] | undefined {
  const methods: PaymentMethod[] = []
  for (const raw of value.split(',')) {
    const name = raw.trim().toLowerCase()
    if (name.length === 0) continue
    if (!isGatewayMethod(name)) return undefined
    if (!methods.includes(name)) methods.push(name)
  }
  return methods.length > 0 ? methods : undefined
}
