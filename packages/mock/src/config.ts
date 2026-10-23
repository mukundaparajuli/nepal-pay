import {
  ConfigurationError,
  PaymentError,
  type Money,
  createMoney,
} from '@nepal-pay/core'
import { DEFAULT_TIMEOUT_MS } from './constants.js'
import type { MockConfig, MockScenario, ResolvedMockConfig } from './types.js'

const SCENARIOS: readonly MockScenario[] = [
  'success',
  'failed',
  'pending',
  'expired',
  'abandoned',
  'delayed',
  'duplicate',
  'timeout',
  'invalid-signature',
]

export function resolveMockConfig(input: MockConfig): ResolvedMockConfig {
  if (typeof input.secretKey !== 'string' || input.secretKey.length === 0) {
    throw new ConfigurationError(
      'Mock gateway requires a non-empty secretKey',
      'INVALID_ORDER'
    )
  }
  const scenario: MockScenario = input.scenario ?? 'success'
  if (!SCENARIOS.includes(scenario)) {
    throw new ConfigurationError(
      `Unknown mock scenario: ${scenario}`,
      'INVALID_STATUS'
    )
  }
  if (
    input.checkoutUrl !== undefined &&
    typeof input.checkoutUrl !== 'string'
  ) {
    throw new ConfigurationError('Mock checkoutUrl must be a string')
  }
  if (
    input.delayMs !== undefined &&
    (!Number.isInteger(input.delayMs) || input.delayMs < 0)
  ) {
    throw new ConfigurationError('Mock delayMs must be a non-negative integer')
  }
  if (
    input.timeoutMs !== undefined &&
    (!Number.isInteger(input.timeoutMs) || input.timeoutMs <= 0)
  ) {
    throw new ConfigurationError('Mock timeoutMs must be a positive integer')
  }
  return {
    secretKey: input.secretKey,
    scenario,
    checkoutUrl: input.checkoutUrl ?? 'https://mock.invalid/pay',
    delayMs: input.delayMs ?? 0,
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  }
}

export function amountToPaisa(money: Money): bigint {
  const precision = money.precision
  if (precision < 0 || precision > 2) {
    throw new PaymentError(
      'Mock gateway supports amounts with precision 0..2',
      'INVALID_AMOUNT'
    )
  }
  const scale = 10n ** BigInt(2 - precision)
  const paisa = money.amount * scale
  if (paisa <= 0n) {
    throw new PaymentError(
      'Mock gateway requires a positive amount in paisa',
      'INVALID_AMOUNT'
    )
  }
  if (paisa > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PaymentError(
      'Mock gateway amount exceeds the safe integer range',
      'UNSAFE_AMOUNT'
    )
  }
  return paisa
}

export function mockMoneyFromPaisa(value: unknown): Money {
  let paisa: bigint
  if (typeof value === 'bigint') {
    paisa = value
  } else if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    paisa = BigInt(value)
  } else {
    throw new Error('Invalid mock amount; expected an integer paisa value')
  }
  if (
    paisa > BigInt(Number.MAX_SAFE_INTEGER) ||
    paisa < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error('Mock amount exceeds the safe integer range')
  }
  return createMoney(paisa, 'NPR', 2)
}

export function mockTxnId(prefix = 'mock'): string {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const byte of bytes) {
    code += byte.toString(16).padStart(2, '0')
  }
  return `${prefix}_${code}`
}
