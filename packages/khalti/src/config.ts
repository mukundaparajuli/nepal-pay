import { ConfigurationError } from '@nepal-payments/core'
import type {
  KhaltiConfig,
  KhaltiEnvironment,
  ResolvedKhaltiConfig,
} from './types.js'

const DEFAULT_TIMEOUT_MS = 10_000

const INITIATE_URLS: Record<KhaltiEnvironment, string> = {
  sandbox: 'https://dev.khalti.com/api/v2/epayment/initiate/',
  production: 'https://khalti.com/api/v2/epayment/initiate/',
}

const LOOKUP_URLS: Record<KhaltiEnvironment, string> = {
  sandbox: 'https://dev.khalti.com/api/v2/epayment/lookup/',
  production: 'https://khalti.com/api/v2/epayment/lookup/',
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function resolveConfig(input: KhaltiConfig): ResolvedKhaltiConfig {
  if (typeof input.secretKey !== 'string' || input.secretKey.length === 0) {
    throw new ConfigurationError('Khalti secretKey is required')
  }
  if (input.environment !== 'sandbox' && input.environment !== 'production') {
    throw new ConfigurationError(
      `Unsupported Khalti environment: ${String(input.environment)}`
    )
  }
  for (const [name, url] of [
    ['returnUrl', input.returnUrl],
    ['websiteUrl', input.websiteUrl],
    ['initiateUrl', input.initiateUrl],
    ['lookupUrl', input.lookupUrl],
  ] as const) {
    if (url !== undefined && !isHttpUrl(url)) {
      throw new ConfigurationError(`Invalid Khalti ${name}: ${String(url)}`)
    }
  }
  if (
    input.timeoutMs !== undefined &&
    (!Number.isInteger(input.timeoutMs) || input.timeoutMs <= 0)
  ) {
    throw new ConfigurationError('Khalti timeoutMs must be a positive integer')
  }

  return {
    secretKey: input.secretKey,
    environment: input.environment,
    returnUrl: input.returnUrl,
    websiteUrl: input.websiteUrl,
    initiateUrl: input.initiateUrl ?? INITIATE_URLS[input.environment],
    lookupUrl: input.lookupUrl ?? LOOKUP_URLS[input.environment],
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fetch: input.fetch ?? globalThis.fetch,
  }
}
