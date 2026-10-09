import type { RawCallbackRequest } from '@nepal-payments/core'

export function callbackData(raw: RawCallbackRequest): string {
  const value = raw.query?.data
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('callback is missing its data payload')
  }
  return value
}
