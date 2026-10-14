import { TXNID_MAX_LENGTH, TXNID_PATTERN } from './constants.js'

/** True when `value` is a well-formed connectIPS TXNID. */
export function isValidTxnId(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= TXNID_MAX_LENGTH &&
    TXNID_PATTERN.test(value)
  )
}

export function formatConnectIpsDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = String(date.getUTCFullYear())
  return `${day}-${month}-${year}`
}

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}
