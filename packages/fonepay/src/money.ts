import {
  createMoney,
  moneyFromDecimal,
  moneyToDecimal,
  VerificationError,
  type Money,
} from '@nepal-pay/core'
import { FONEPAY_CURRENCY } from './constants.js'

const FONEPAY_PRECISION = 2

/**
 * Convert a Money amount to the 2-decimal NPR string Fonepay expects for AMT,
 * P_AMT and R_AMT.
 */
export function fonepayAmountFromMoney(money: Money): string {
  if (money.currency !== FONEPAY_CURRENCY) {
    throw new VerificationError(
      `Fonepay requires ${FONEPAY_CURRENCY}, got ${money.currency}`,
      'INVALID_CURRENCY'
    )
  }
  if (money.precision > FONEPAY_PRECISION) {
    throw new VerificationError(
      'Fonepay amounts cannot have more than 2 decimal places',
      'INVALID_PRECISION'
    )
  }
  const scaled =
    money.amount * 10n ** BigInt(FONEPAY_PRECISION - money.precision)
  return moneyToDecimal(
    createMoney(scaled, FONEPAY_CURRENCY, FONEPAY_PRECISION)
  )
}

/** Interpret a Fonepay amount (AMT / P_AMT / R_AMT) as NPR Money. */
export function fonepayMoneyFromAmount(value: unknown): Money {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new VerificationError(
      `Invalid Fonepay amount: ${String(value)}`,
      'INVALID_AMOUNT'
    )
  }
  const decimal = typeof value === 'string' ? value.trim() : String(value)
  if (decimal.length === 0) {
    throw new VerificationError(
      'Invalid Fonepay amount: empty',
      'INVALID_AMOUNT'
    )
  }
  try {
    return moneyFromDecimal(decimal, FONEPAY_CURRENCY, FONEPAY_PRECISION)
  } catch {
    throw new VerificationError(
      `Invalid Fonepay amount: ${decimal}`,
      'INVALID_AMOUNT'
    )
  }
}
