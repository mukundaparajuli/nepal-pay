import {
  PaymentError,
  safeBase64Decode,
  type RawCallbackRequest,
  type UnverifiedCallback,
} from '@nepal-pay/core'
import type { EsewaCallbackPayload } from './types.js'

const REQUIRED_FIELDS = [
  'status',
  'signature',
  'total_amount',
  'transaction_uuid',
  'product_code',
  'signed_field_names',
]

function normalizeBase64(value: string): string {
  const converted = value.trim().replace(/-/g, '+').replace(/_/g, '/')
  const padding = (4 - (converted.length % 4)) % 4
  return converted + '='.repeat(padding)
}

export function parseEsewaCallback(
  request: RawCallbackRequest
): UnverifiedCallback {
  const query = request.query ?? {}
  const queryData = typeof query.data === 'string' ? query.data : undefined
  const bodyData =
    typeof request.body === 'object' &&
    request.body !== null &&
    typeof (request.body as { data?: unknown }).data === 'string'
      ? (request.body as { data: string }).data
      : undefined
  const raw = queryData ?? bodyData
  if (raw === undefined) {
    throw new PaymentError(
      'eSewa callback is missing the base64 "data" parameter',
      'MALFORMED_CALLBACK'
    )
  }

  let text: string
  try {
    text = safeBase64Decode(normalizeBase64(raw))
  } catch {
    throw new PaymentError(
      'eSewa callback "data" is not valid base64',
      'MALFORMED_CALLBACK'
    )
  }

  let payload: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error()
    }
    payload = parsed as Record<string, unknown>
  } catch {
    throw new PaymentError(
      'eSewa callback "data" is not valid JSON',
      'MALFORMED_CALLBACK'
    )
  }

  for (const field of REQUIRED_FIELDS) {
    if (payload[field] === undefined) {
      throw new PaymentError(
        `eSewa callback is missing "${field}"`,
        'MALFORMED_CALLBACK'
      )
    }
  }

  return {
    gateway: 'esewa',
    data: payload as EsewaCallbackPayload,
    body: text,
    headers: request.headers,
  }
}
