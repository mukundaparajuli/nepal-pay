import type { PaymentMethod } from './method.js'
import { sha256 } from './utils.js'

export interface RawCallbackRequest {
  readonly body?: unknown
  readonly query?: Record<string, unknown>
  readonly headers?: Record<string, string>
}

export interface UnverifiedCallback {
  readonly gateway: PaymentMethod
  readonly data: Record<string, unknown>
  readonly headers?: Record<string, string>
  readonly body?: unknown
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null'
  if (typeof value === 'bigint') return JSON.stringify(value.toString())
  if (typeof value !== 'object' || value === null) {
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']'
  }
  const record = value as Record<string, unknown>
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
  return '{' + entries.join(',') + '}'
}

export async function callbackFingerprint(
  callback: UnverifiedCallback
): Promise<string> {
  return sha256(
    stableStringify({
      gateway: callback.gateway,
      data: callback.data,
      headers: callback.headers ?? null,
      body: callback.body ?? null,
    })
  )
}
