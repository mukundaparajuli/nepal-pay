import { PRN_MAX_LENGTH, PRN_MIN_LENGTH, PRN_PATTERN } from './constants.js'

/** True when `value` is a well-formed Fonepay PRN. */
export function isValidPrn(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.length >= PRN_MIN_LENGTH &&
    value.length <= PRN_MAX_LENGTH &&
    PRN_PATTERN.test(value)
  )
}

/** Format a date as `MM/DD/YYYY` (UTC), the format Fonepay expects for DT. */
export function formatFonepayDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const year = String(date.getUTCFullYear())
  return `${month}/${day}/${year}`
}

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}
