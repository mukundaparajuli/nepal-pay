export const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

export const DEFAULT_TIMEOUT_MS = 10_000

export function isPaisaAmount(value: unknown): value is string {
  return typeof value === 'string' && /^-?\d+$/.test(value)
}
