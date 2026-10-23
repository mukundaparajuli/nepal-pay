import {
  createMoney,
  moneyFromDecimal,
  VerificationError,
  type Money,
} from '@nepal-pay/core'
import { CONNECTIPS_CURRENCY } from './constants.js'

const PAISA_PRECISION = 2

function scaleToPaisa(money: Money): bigint {
  if (money.currency !== CONNECTIPS_CURRENCY) {
    throw new VerificationError(
      `connectIPS requires ${CONNECTIPS_CURRENCY}, got ${money.currency}`,
      'INVALID_CURRENCY'
    )
  }
  if (money.precision > PAISA_PRECISION) {
    throw new VerificationError(
      'connectIPS amounts cannot have more than 2 decimal places',
      'INVALID_PRECISION'
    )
  }
  return money.amount * 10n ** BigInt(PAISA_PRECISION - money.precision)
}

/** Convert a Money amount to the integer paisa string connectIPS expects. */
export function connectIpsPaisaFromMoney(money: Money): string {
  return scaleToPaisa(money).toString()
}

/**
 * Interpret a connectIPS `txnAmt` value as NPR Money.
 *
 * NCHL documents the amount as an integer number of paisa, so integers are
 * treated as paisa. A decimal string (as seen in some `gettxndetail` samples)
 * is treated as rupees with 2 decimal places.
 */
export function connectIpsMoneyFromAmount(value: unknown): Money {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new VerificationError(
        `connectIPS amount exceeds the safe range: ${String(value)}`,
        'UNSAFE_AMOUNT'
      )
    }
    return createMoney(BigInt(value), CONNECTIPS_CURRENCY, PAISA_PRECISION)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^-?\d+$/.test(trimmed)) {
      return createMoney(trimmed, CONNECTIPS_CURRENCY, PAISA_PRECISION)
    }
    if (/^-?\d+\.\d+$/.test(trimmed)) {
      return moneyFromDecimal(trimmed, CONNECTIPS_CURRENCY, PAISA_PRECISION)
    }
  }
  throw new VerificationError(
    `Invalid connectIPS amount: ${String(value)}`,
    'INVALID_AMOUNT'
  )
}
