import { hmacSha512, verifyHmacSha512 } from '@nepal-payments/core'
import { REQUEST_FIELDS, RESPONSE_FIELDS } from './constants.js'

function stringValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value)
}

/** Build the checkout request DV message: values joined with commas. */
export function buildRequestMessage(
  values: Readonly<Record<string, unknown>>
): string {
  return REQUEST_FIELDS.map((field) => stringValue(values[field])).join(',')
}

/** Build the callback response DV message: values joined with commas. */
export function buildResponseMessage(
  values: Readonly<Record<string, unknown>>
): string {
  return RESPONSE_FIELDS.map((field) => stringValue(values[field])).join(',')
}

/** Compute the uppercase hex HMAC-SHA512 DV for a message. */
export async function generateFonepayDv(
  message: string,
  secretKey: string
): Promise<string> {
  const digest = await hmacSha512(message, secretKey)
  return digest.toUpperCase()
}

/**
 * Verify a Fonepay DV in constant time. Comparison is case-insensitive: the
 * digest is decoded to bytes conceptually (we normalise hex case) before the
 * constant-time compare.
 */
export function verifyFonepayDv(
  message: string,
  secretKey: string,
  dv: string
): Promise<boolean> {
  return verifyHmacSha512(message, secretKey, dv)
}
