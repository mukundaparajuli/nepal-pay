import { ConfigurationError } from '@nepal-payments/core'
import type { FonepayConfig, ResolvedFonepayConfig } from './types.js'
import { REQUEST_URLS, VERIFICATION_URLS } from './constants.js'
import { isHttpUrl } from './validation.js'

const DEFAULT_TIMEOUT_MS = 10_000

export function resolveConfig(input: FonepayConfig): ResolvedFonepayConfig {
  for (const [name, value] of [
    ['merchantCode', input.merchantCode],
    ['secretKey', input.secretKey],
  ] as const) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new ConfigurationError(`Fonepay ${name} is required`)
    }
  }
  if (input.environment !== 'sandbox' && input.environment !== 'production') {
    throw new ConfigurationError(
      `Unsupported Fonepay environment: ${String(input.environment)}`
    )
  }

  const requestUrl = input.requestUrl ?? REQUEST_URLS[input.environment]
  const verificationUrl =
    input.verificationUrl ?? VERIFICATION_URLS[input.environment]

  for (const [name, url] of [
    ['requestUrl', requestUrl],
    ['verificationUrl', verificationUrl],
  ] as const) {
    if (!isHttpUrl(url)) {
      throw new ConfigurationError(`Invalid Fonepay ${name}: ${String(url)}`)
    }
  }

  if (input.returnUrl !== undefined && !isHttpUrl(input.returnUrl)) {
    throw new ConfigurationError(
      `Invalid Fonepay returnUrl: ${String(input.returnUrl)}`
    )
  }

  if (
    input.timeoutMs !== undefined &&
    (!Number.isInteger(input.timeoutMs) || input.timeoutMs <= 0)
  ) {
    throw new ConfigurationError('Fonepay timeoutMs must be a positive integer')
  }

  return {
    merchantCode: input.merchantCode,
    secretKey: input.secretKey,
    environment: input.environment,
    returnUrl: input.returnUrl,
    remarks1: input.remarks1,
    remarks2: input.remarks2,
    serverVerification: input.serverVerification ?? true,
    requestUrl,
    verificationUrl,
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    now: input.now ?? (() => new Date()),
    fetch: input.fetch ?? globalThis.fetch,
  }
}
