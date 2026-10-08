import { MoneyError } from './errors.js'

export type Currency = 'NPR'

export interface Money {
  readonly amount: bigint
  readonly currency: Currency
  readonly precision: number
}

export interface MoneyJSON {
  readonly amount: string
  readonly currency: Currency
  readonly precision: number
}

const SUPPORTED_CURRENCIES: Currency[] = ['NPR']
const DEFAULT_PRECISION = 2

function assertCurrency(currency: Currency): void {
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    throw new MoneyError(
      `Unsupported currency: ${String(currency)}`,
      'INVALID_CURRENCY'
    )
  }
}

function assertPrecision(precision: number): void {
  if (precision < 0 || !Number.isInteger(precision)) {
    throw new MoneyError(
      'Precision must be a non-negative integer',
      'INVALID_PRECISION'
    )
  }
}

export function isMoney(value: unknown): value is Money {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as {
    amount?: unknown
    currency?: unknown
    precision?: unknown
  }
  return (
    typeof candidate.amount === 'bigint' &&
    candidate.currency === 'NPR' &&
    typeof candidate.precision === 'number' &&
    Number.isInteger(candidate.precision) &&
    (candidate.precision as number) >= 0
  )
}

export function createMoney(
  amount: bigint | number | string,
  currency: Currency = 'NPR',
  precision: number = DEFAULT_PRECISION
): Money {
  assertCurrency(currency)
  assertPrecision(precision)

  let amountBigInt: bigint
  if (typeof amount === 'bigint') {
    amountBigInt = amount
  } else if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
      throw new MoneyError(
        'Number amount must be an integer (use string for decimals)',
        'INVALID_AMOUNT'
      )
    }
    if (!Number.isSafeInteger(amount)) {
      throw new MoneyError(
        'Number amount exceeds the safe integer range (use string or bigint)',
        'UNSAFE_AMOUNT'
      )
    }
    amountBigInt = BigInt(amount)
  } else if (typeof amount === 'string') {
    const trimmed = amount.trim()
    if (!/^-?\d+$/.test(trimmed)) {
      throw new MoneyError(
        'String amount must contain only digits (no decimal point)',
        'INVALID_AMOUNT'
      )
    }
    amountBigInt = BigInt(trimmed)
  } else {
    throw new MoneyError('Amount must be bigint, number, or string')
  }

  return {
    amount: amountBigInt,
    currency,
    precision,
  }
}

export function moneyFromDecimal(
  decimal: string,
  currency: Currency = 'NPR',
  precision: number = DEFAULT_PRECISION
): Money {
  assertCurrency(currency)
  assertPrecision(precision)

  const trimmed = decimal.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new MoneyError('Invalid decimal format', 'INVALID_DECIMAL')
  }

  const parts = trimmed.split('.')
  const intPartStr = parts[0] ?? '0'
  const fracPartStr = parts[1] ?? ''

  if (fracPartStr.length > precision) {
    throw new MoneyError(
      `Decimal has more fractional digits than precision ${precision}`,
      'INVALID_PRECISION'
    )
  }

  const paddedFrac = fracPartStr.padEnd(precision, '0')
  const sign = intPartStr.startsWith('-') ? '-' : ''
  const absInt = intPartStr.replace(/^-/, '') || '0'
  const scaledStr = sign + absInt + paddedFrac

  return {
    amount: BigInt(scaledStr),
    currency,
    precision,
  }
}

export function moneyToDecimal(money: Money): string {
  const absAmount = money.amount >= 0n ? money.amount : -money.amount
  const sign = money.amount < 0n ? '-' : ''
  const precision = money.precision

  if (precision === 0) {
    return sign + absAmount.toString()
  }

  const amountStr = absAmount.toString().padStart(precision + 1, '0')
  const intPart = amountStr.slice(0, amountStr.length - precision) || '0'
  const fracPart = amountStr.slice(amountStr.length - precision)
  return sign + intPart + '.' + fracPart
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency || a.precision !== b.precision) {
    throw new MoneyError(
      'Cannot add money with different currency or precision'
    )
  }
  return {
    amount: a.amount + b.amount,
    currency: a.currency,
    precision: a.precision,
  }
}

export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency || a.precision !== b.precision) {
    throw new MoneyError(
      'Cannot subtract money with different currency or precision'
    )
  }
  return {
    amount: a.amount - b.amount,
    currency: a.currency,
    precision: a.precision,
  }
}

export function multiplyMoney(a: Money, multiplier: bigint | number): Money {
  let mult: bigint
  if (typeof multiplier === 'bigint') {
    mult = multiplier
  } else if (typeof multiplier === 'number') {
    if (!Number.isSafeInteger(multiplier)) {
      throw new MoneyError('Multiplier must be a safe integer', 'UNSAFE_AMOUNT')
    }
    mult = BigInt(multiplier)
  } else {
    throw new MoneyError('Multiplier must be bigint or number')
  }
  return {
    amount: a.amount * mult,
    currency: a.currency,
    precision: a.precision,
  }
}

function scaledAmount(money: Money, targetPrecision: number): bigint {
  const scale = 10n ** BigInt(targetPrecision - money.precision)
  return money.amount * scale
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      'Cannot compare money with different currencies',
      'CURRENCY_MISMATCH'
    )
  }
  const targetPrecision = Math.max(a.precision, b.precision)
  const scaledA = scaledAmount(a, targetPrecision)
  const scaledB = scaledAmount(b, targetPrecision)
  if (scaledA < scaledB) return -1
  if (scaledA > scaledB) return 1
  return 0
}

export function moneyEquals(a: Money, b: Money): boolean {
  try {
    return compareMoney(a, b) === 0
  } catch {
    return false
  }
}

export function moneyToJSON(money: Money): MoneyJSON {
  return {
    amount: money.amount.toString(),
    currency: money.currency,
    precision: money.precision,
  }
}

export function moneyFromJSON(json: unknown): Money {
  if (typeof json !== 'object' || json === null) {
    throw new MoneyError('Money JSON must be an object', 'INVALID_MONEY')
  }
  const candidate = json as {
    amount?: unknown
    currency?: unknown
    precision?: unknown
  }
  if (typeof candidate.amount !== 'string') {
    throw new MoneyError('Money JSON amount must be a string', 'INVALID_MONEY')
  }
  if (typeof candidate.currency !== 'string') {
    throw new MoneyError(
      'Money JSON currency must be a string',
      'INVALID_MONEY'
    )
  }
  if (typeof candidate.precision !== 'number') {
    throw new MoneyError(
      'Money JSON precision must be a number',
      'INVALID_MONEY'
    )
  }
  return createMoney(
    candidate.amount,
    candidate.currency as Currency,
    candidate.precision
  )
}

export function isZero(money: Money): boolean {
  return money.amount === 0n
}

export function isPositive(money: Money): boolean {
  return money.amount > 0n
}

export function isNegative(money: Money): boolean {
  return money.amount < 0n
}
