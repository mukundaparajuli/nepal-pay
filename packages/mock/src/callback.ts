import {
  PaymentError,
  safeBase64Decode,
  type RawCallbackRequest,
  type UnverifiedCallback,
} from '@nepal-payments/core'

const REQUIRED_FIELDS = [
  'txn_id',
  'order_id',
  'amount',
  'status',
  'signature',
] as const

export function parseMockCallback(
  request: RawCallbackRequest
): UnverifiedCallback {
  const query = request.query
  if (typeof query !== 'object' || query === null || Array.isArray(query)) {
    throw new PaymentError(
      'Mock callback requires a query record',
      'MALFORMED_CALLBACK'
    )
  }
  const rawData = query['data']
  if (typeof rawData !== 'string' || rawData.length === 0) {
    throw new PaymentError(
      'Mock callback is missing the data field',
      'MALFORMED_CALLBACK'
    )
  }
  let decoded: string
  try {
    decoded = safeBase64Decode(rawData)
  } catch {
    throw new PaymentError(
      'Mock callback data is not valid base64',
      'MALFORMED_CALLBACK'
    )
  }
  let payload: unknown
  try {
    payload = JSON.parse(decoded)
  } catch {
    throw new PaymentError(
      'Mock callback data is not valid JSON',
      'MALFORMED_CALLBACK'
    )
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new PaymentError(
      'Mock callback data must be an object',
      'MALFORMED_CALLBACK'
    )
  }
  const record = payload as Record<string, unknown>
  for (const name of REQUIRED_FIELDS) {
    if (typeof record[name] !== 'string' || record[name].length === 0) {
      throw new PaymentError(
        `Mock callback is missing field "${name}"`,
        'MALFORMED_CALLBACK'
      )
    }
  }
  return { gateway: 'mock', data: { ...record }, body: decoded }
}
