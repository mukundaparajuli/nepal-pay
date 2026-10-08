import { describe, it, expect } from 'vitest'
import {
  createMoney,
  moneyFromDecimal,
  moneyToDecimal,
  addMoney,
  subtractMoney,
  multiplyMoney,
  compareMoney,
  moneyEquals,
  isZero,
  isPositive,
  isNegative,
  MoneyError,
} from '@nepal-payments/core'

describe('Money (bigint)', () => {
  it('creates money from bigint', () => {
    const money = createMoney(10000n)
    expect(money.amount).toBe(10000n)
    expect(money.currency).toBe('NPR')
    expect(money.precision).toBe(2)
  })

  it('creates money from number (integer)', () => {
    const money = createMoney(10000)
    expect(money.amount).toBe(10000n)
  })

  it('creates money from string (scaled)', () => {
    const money = createMoney('10000')
    expect(money.amount).toBe(10000n)
  })

  it('throws on non-integer number', () => {
    expect(() => createMoney(1000.5)).toThrow(MoneyError)
  })

  it('creates money from decimal string for NPR (2 decimals)', () => {
    const money = moneyFromDecimal('1000.50')
    expect(money.amount).toBe(100050n)
    expect(moneyToDecimal(money)).toBe('1000.50')
  })

  it('creates money from integer decimal', () => {
    const money = moneyFromDecimal('1000')
    expect(money.amount).toBe(100000n)
    expect(moneyToDecimal(money)).toBe('1000.00')
  })

  it('handles one decimal place', () => {
    const money = moneyFromDecimal('1000.5')
    expect(money.amount).toBe(100050n)
    expect(moneyToDecimal(money)).toBe('1000.50')
  })

  it('handles .50 format correctly', () => {
    const money = moneyFromDecimal('0.50')
    expect(money.amount).toBe(50n)
    expect(moneyToDecimal(money)).toBe('0.50')
  })

  it('throws if decimal has more precision than specified', () => {
    expect(() => moneyFromDecimal('1000.123', 'NPR', 2)).toThrow(MoneyError)
  })

  it('rejects invalid decimal formats', () => {
    expect(() => moneyFromDecimal('1000.50.00')).toThrow(MoneyError)
    expect(() => moneyFromDecimal('abc')).toThrow(MoneyError)
    expect(() => moneyFromDecimal('1000,50')).toThrow(MoneyError)
  })

  it('rejects non-digit strings in createMoney', () => {
    expect(() => createMoney('1000.50')).toThrow(MoneyError)
  })

  it('converts back to decimal', () => {
    expect(moneyToDecimal(moneyFromDecimal('10.00'))).toBe('10.00')
    expect(moneyToDecimal(moneyFromDecimal('0.05'))).toBe('0.05')
    expect(moneyToDecimal(moneyFromDecimal('123456.78'))).toBe('123456.78')
  })

  it('handles zero', () => {
    const money = moneyFromDecimal('0')
    expect(isZero(money)).toBe(true)
    expect(moneyToDecimal(money)).toBe('0.00')
  })

  it('adds money correctly', () => {
    const a = moneyFromDecimal('100.00')
    const b = moneyFromDecimal('50.50')
    const result = addMoney(a, b)
    expect(moneyToDecimal(result)).toBe('150.50')
  })

  it('subtracts money correctly', () => {
    const a = moneyFromDecimal('100.00')
    const b = moneyFromDecimal('30.25')
    const result = subtractMoney(a, b)
    expect(moneyToDecimal(result)).toBe('69.75')
  })

  it('multiplies money correctly', () => {
    const a = moneyFromDecimal('10.00')
    const result = multiplyMoney(a, 3)
    expect(moneyToDecimal(result)).toBe('30.00')
  })

  it('multiplies by bigint', () => {
    const a = moneyFromDecimal('10.50')
    const result = multiplyMoney(a, 2n)
    expect(moneyToDecimal(result)).toBe('21.00')
  })

  it('compares money correctly', () => {
    const a = moneyFromDecimal('100.00')
    const b = moneyFromDecimal('50.00')
    const c = moneyFromDecimal('100.00')
    expect(compareMoney(a, b)).toBe(1)
    expect(compareMoney(b, a)).toBe(-1)
    expect(compareMoney(a, c)).toBe(0)
  })

  it('checks equality', () => {
    const a = moneyFromDecimal('100.00')
    const b = moneyFromDecimal('100.00')
    const c = moneyFromDecimal('100.01')
    expect(moneyEquals(a, b)).toBe(true)
    expect(moneyEquals(a, c)).toBe(false)
  })

  it('identifies positive/negative', () => {
    const pos = moneyFromDecimal('10.00')
    const neg = moneyFromDecimal('-10.00')
    const zero = moneyFromDecimal('0')
    expect(isPositive(pos)).toBe(true)
    expect(isNegative(pos)).toBe(false)
    expect(isPositive(neg)).toBe(false)
    expect(isNegative(neg)).toBe(true)
    expect(isZero(zero)).toBe(true)
  })

  it('handles negative decimals', () => {
    const money = moneyFromDecimal('-50.25')
    expect(money.amount).toBe(-5025n)
    expect(moneyToDecimal(money)).toBe('-50.25')
  })

  it('throws when adding different currencies', () => {
    const a = moneyFromDecimal('10.00', 'NPR')
    const b = { amount: 1000n, currency: 'USD', precision: 2 }
    // @ts-expect-error 'USD' is not a supported currency
    expect(() => addMoney(a, b)).toThrow(MoneyError)
  })

  it('throws when multiplying by non-integer number', () => {
    const a = moneyFromDecimal('10.00')
    expect(() => multiplyMoney(a, 1.5)).toThrow(MoneyError)
  })

  it('throws on unsupported currency', () => {
    // @ts-expect-error 'USD' is not a supported currency
    expect(() => createMoney(1000, 'USD')).toThrow(MoneyError)
  })

  it('throws on invalid precision', () => {
    expect(() => createMoney(1000, 'NPR', -1)).toThrow(MoneyError)
    expect(() => createMoney(1000, 'NPR', 1.5)).toThrow(MoneyError)
  })
})
