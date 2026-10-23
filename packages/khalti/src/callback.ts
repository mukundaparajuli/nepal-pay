import {
  PaymentError,
  type RawCallbackRequest,
  type UnverifiedCallback,
} from '@nepal-pay/core'
import type { KhaltiCallbackPayload } from './types.js'

function collectQueryParams(
  query: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      out[name] = value
    } else if (
      Array.isArray(value) &&
      value.length === 1 &&
      typeof value[0] === 'string'
    ) {
      out[name] = value[0]
    }
  }
  return out
}

export function parseKhaltiCallback(
  request: RawCallbackRequest
): UnverifiedCallback {
  const query = request.query ?? {}
  if (typeof query !== 'object' || query === null || Array.isArray(query)) {
    throw new PaymentError(
      'Khalti callback query must be a parameter record',
      'MALFORMED_CALLBACK'
    )
  }

  const params = collectQueryParams(query as Record<string, unknown>)
  const pidx = params['pidx']
  if (typeof pidx !== 'string' || pidx.length === 0) {
    throw new PaymentError(
      'Khalti callback is missing a non-empty pidx',
      'MALFORMED_CALLBACK'
    )
  }

  return {
    gateway: 'khalti',
    data: params as KhaltiCallbackPayload,
    body: request.body,
    headers: request.headers,
  }
}
