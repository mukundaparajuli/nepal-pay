import { ConfigurationError } from '@nepal-payments/core'
import type {
  ConnectIpsConfig,
  ConnectIpsEnvironment,
  ResolvedConnectIpsConfig,
} from './types.js'
import { isHttpUrl } from './validation.js'

const DEFAULT_TIMEOUT_MS = 10_000

const BASE_URLS: Record<ConnectIpsEnvironment, string> = {
  sandbox: 'https://uat.connectips.com',
  production: 'https://connectips.com',
}

function baseUrlFor(input: ConnectIpsConfig): string {
  if (input.baseUrl !== undefined) {
    if (!isHttpUrl(input.baseUrl)) {
      throw new ConfigurationError(
        `Invalid connectIPS baseUrl: ${String(input.baseUrl)}`
      )
    }
    return input.baseUrl.replace(/\/+$/, '')
  }
  return BASE_URLS[input.environment]
}

export function resolveConfig(
  input: ConnectIpsConfig
): ResolvedConnectIpsConfig {
  for (const [name, value] of [
    ['merchantId', input.merchantId],
    ['appId', input.appId],
    ['appName', input.appName],
    ['password', input.password],
    ['privateKey', input.privateKey],
  ] as const) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new ConfigurationError(`connectIPS ${name} is required`)
    }
  }
  if (input.environment !== 'sandbox' && input.environment !== 'production') {
    throw new ConfigurationError(
      `Unsupported connectIPS environment: ${String(input.environment)}`
    )
  }

  const base = baseUrlFor(input)
  const loginUrl = input.loginUrl ?? `${base}/connectipswebgw/loginpage`
  const validationUrl =
    input.validationUrl ?? `${base}/connectipswebws/api/creditor/validatetxn`
  const txnDetailUrl =
    input.txnDetailUrl ?? `${base}/connectipswebws/api/creditor/gettxndetail`

  for (const [name, url] of [
    ['loginUrl', loginUrl],
    ['validationUrl', validationUrl],
    ['txnDetailUrl', txnDetailUrl],
  ] as const) {
    if (!isHttpUrl(url)) {
      throw new ConfigurationError(`Invalid connectIPS ${name}: ${String(url)}`)
    }
  }

  if (
    input.timeoutMs !== undefined &&
    (!Number.isInteger(input.timeoutMs) || input.timeoutMs <= 0)
  ) {
    throw new ConfigurationError(
      'connectIPS timeoutMs must be a positive integer'
    )
  }

  return {
    merchantId: input.merchantId,
    appId: input.appId,
    appName: input.appName,
    password: input.password,
    privateKey: input.privateKey,
    environment: input.environment,
    remarks: input.remarks,
    particulars: input.particulars,
    loginUrl,
    validationUrl,
    txnDetailUrl,
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    now: input.now ?? (() => new Date()),
    fetch: input.fetch ?? globalThis.fetch,
  }
}
