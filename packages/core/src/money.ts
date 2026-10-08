import { MoneyError } from './errors.js'

export type Currency = 'NPR'

export interface Money {
  readonly amount: bigint
  readonly currency: Currency
  readonly precision: number
}

const SUPPORTED_CURRENCIES: Currency[] = ['NPR']
const DEFAULT_PRECISION = 2 // NPR has 2 decimal places (paisa)

export function createMoney(
  amount: bigint | number | string,
  currency: Currency = 'NPR',
  precision: number = DEFAULT_PRECISION
): Money {
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    throw new MoneyError(`Unsupported currency: ${currency}`)
  }
  if (precision < 0 || !Number.isInteger(precision)) {
    throw new MoneyError('Precision must be a non-negative integer')
  }

  let amountBigInt: bigint
  if (typeof amount === 'bigint') {
    amountBigInt = amount
  } else if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
      throw new MoneyError('Number amount must be an integer (use string for decimals)')
    }
    amountBigInt = BigInt(Math.trunc(amount))
  } else if (typeof amount === 'string') {
    const trimmed = amount.trim()
    if (!/^-?\d+$/.test(trimmed)) {
      throw new MoneyError('String amount must contain only digits (no decimal point)')
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
  const trimmed = decimal.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new MoneyError('Invalid decimal format')
  }

  const [intPart, fracPart = ''] = trimmed.split('.')
  if (fracPart.length > precision) {
    throw new MoneyError(`Decimal has more fractional digits than precision ${precision}`)
  }

  const paddedFrac = fracPart.padEnd(precision, '0')
  const sign = intPart.startsWith('-') ? '-' : ''
  const absInt = intPart.replace(/^-/, '') || '0'
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
    throw new MoneyError('Cannot add money with different currency or precision')
  }
  return {
    amount: a.amount + b.amount,
    currency: a.currency,
    precision: a.precision,
  }
}

export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency || a.precision !== b.precision) {
    throw new MoneyError('Cannot subtract money with different currency or precision')
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
    if (!Number.isInteger(multiplier)) {
      throw new MoneyError('Multiplier must be integer')
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

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  if (a.currency !== b.currency || a.precision !== b.precision) {
    throw new MoneyError('Cannot compare money with different currency or precision')
  }
  if (a.amount < b.amount) return -1
  if (a.amount > b.amount) return 1
  return 0
}

export function moneyEquals(a: Money, b: Money): boolean {
  try {
    return compareMoney(a, b) === 0
  } catch {
    return false
  }
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
