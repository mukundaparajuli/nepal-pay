import {
  PaymentError,
  type RawCallbackRequest,
  type UnverifiedCallback,
} from '@nepal-pay/core'
import type { FonepayCallbackPayload } from './types.js'
import { isValidPrn } from './validation.js'

const REQUIRED_FIELDS = ['PRN', 'PID', 'PS', 'RC', 'DV'] as const

function recordFromBody(body: unknown): Record<string, unknown> {
  if (typeof body === 'string') {
    const params = new URLSearchParams(body)
    const record: Record<string, unknown> = {}
    for (const [key, value] of params) record[key] = value
    return record
  }
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    return body as Record<string, unknown>
  }
  return {}
}

/**
 * Parse a Fonepay redirect callback. Fonepay appends the signed result to the
 * registered return URL as query parameters; the body is also accepted for
 * convenience.
 */
export function parseFonepayCallback(
  request: RawCallbackRequest
): UnverifiedCallback {
  const source: Record<string, unknown> = {
    ...recordFromBody(request.body),
    ...(request.query ?? {}),
  }

  for (const field of REQUIRED_FIELDS) {
    const value = source[field]
    if (typeof value !== 'string' || value.length === 0) {
      throw new PaymentError(
        `Fonepay callback is missing "${field}"`,
        'MALFORMED_CALLBACK'
      )
    }
  }

  const prn = source.PRN as string
  if (!isValidPrn(prn)) {
    throw new PaymentError(
      'Fonepay callback PRN is malformed',
      'MALFORMED_CALLBACK'
    )
  }

  return {
    gateway: 'fonepay',
    data: source as FonepayCallbackPayload,
    body: request.body,
    headers: request.headers,
  }
}
