import { ConfigurationError } from '@nepal-payments/core'
import type {
  EsewaConfig,
  EsewaEnvironment,
  ResolvedEsewaConfig,
} from './types.js'

const DEFAULT_TIMEOUT_MS = 10_000

const FORM_URLS: Record<EsewaEnvironment, string> = {
  sandbox: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
  production: 'https://epay.esewa.com.np/api/epay/main/v2/form',
}

const STATUS_URLS: Record<EsewaEnvironment, string> = {
  sandbox: 'https://rc-epay.esewa.com.np/api/epay/transaction/status/',
  production: 'https://epay.esewa.com.np/api/epay/transaction/status/',
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function resolveConfig(input: EsewaConfig): ResolvedEsewaConfig {
  if (
    typeof input.merchantCode !== 'string' ||
    input.merchantCode.length === 0
  ) {
    throw new ConfigurationError('eSewa merchantCode is required')
  }
  if (typeof input.secret !== 'string' || input.secret.length === 0) {
    throw new ConfigurationError('eSewa secret is required')
  }
  if (input.environment !== 'sandbox' && input.environment !== 'production') {
    throw new ConfigurationError(
      `Unsupported eSewa environment: ${String(input.environment)}`
    )
  }
  for (const [name, url] of [
    ['successUrl', input.successUrl],
    ['failureUrl', input.failureUrl],
    ['checkoutFormUrl', input.checkoutFormUrl],
    ['statusCheckUrl', input.statusCheckUrl],
  ] as const) {
    if (url !== undefined && !isHttpUrl(url)) {
      throw new ConfigurationError(`Invalid eSewa ${name}: ${String(url)}`)
    }
  }
  if (
    input.timeoutMs !== undefined &&
    (!Number.isInteger(input.timeoutMs) || input.timeoutMs <= 0)
  ) {
    throw new ConfigurationError('eSewa timeoutMs must be a positive integer')
  }

  return {
    merchantCode: input.merchantCode,
    secret: input.secret,
    environment: input.environment,
    successUrl: input.successUrl,
    failureUrl: input.failureUrl,
    checkoutFormUrl: input.checkoutFormUrl ?? FORM_URLS[input.environment],
    statusCheckUrl: input.statusCheckUrl ?? STATUS_URLS[input.environment],
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fetch: input.fetch ?? globalThis.fetch,
  }
}
