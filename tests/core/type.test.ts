import { describe, it, expect } from 'vitest'
import { moneyFromDecimal } from '@nepal-payments/core'
import type {
  GatewayAdapter,
  Order,
  PaymentMethod,
  PaymentStatus,
  UnverifiedCallback,
} from '@nepal-payments/core'

declare const gateway: GatewayAdapter
declare const callback: UnverifiedCallback

const order: Order = {
  id: 'ORD001',
  amount: moneyFromDecimal('100.00'),
}

function verifyOptionsTypeChecks(): void {
  // @ts-expect-error verify requires options containing the expected order
  void gateway.verify(callback, { expectedOrdId: order })
  // @ts-expect-error verify requires options
  void gateway.verify(callback)
  // @ts-expect-error expected must be an Order, not a bare string
  void gateway.verify(callback, { expected: 'ORD001' })
  void gateway.verify(callback, { expected: order })
}

function statusTypeChecks(): void {
  void gateway.status({ id: 'TXN1', gateway: 'esewa' })
  void gateway.status({ id: 'TXN1', gateway: 'esewa' }, { reason: 'poll' })
}

function badGatewayName(): unknown {
  const adapter = {
    // @ts-expect-error 'someone' is not a supported payment method
    name: 'someone',
    createCheckout: async () => ({
      checkout: { type: 'redirect', url: 'https://pay.example/start' },
      txnRef: { id: 'TXN1', gateway: 'esewa' },
    }),
    parseCallback: () => ({ gateway: 'esewa' as const, data: {} }),
    verify: async () => {
      throw new Error('not needed')
    },
    status: async () => {
      throw new Error('not needed')
    },
  } satisfies GatewayAdapter
  return adapter
}

// @ts-expect-error VerifiedPaymentInput is internal and not exported from the package root
type ForbiddenInput = import('@nepal-payments/core').VerifiedPaymentInput
const inputIsNull = (value: ForbiddenInput | null): boolean => value === null

describe('adapter option typing', () => {
  it('requires the expected order on verify', () => {
    expect(typeof verifyOptionsTypeChecks).toBe('function')
  })

  it('keeps status options optional', () => {
    expect(typeof statusTypeChecks).toBe('function')
  })

  it('rejects unsupported gateway names', () => {
    expect(typeof badGatewayName).toBe('function')
  })

  it('keeps the seal input type out of the public surface', () => {
    expect(inputIsNull(null)).toBe(true)
  })
})

describe('payment method and status unions', () => {
  it('accepts the supported gateway names', () => {
    const method: PaymentMethod = 'fonepay'
    expect(method).toBe('fonepay')
  })

  it('accepts only the documented payment states', () => {
    const status: PaymentStatus = 'completed'
    expect(status).toBe('completed')
    // @ts-expect-error refunded is not part of the payment state set
    const rejected: PaymentStatus = 'refunded'
    expect(rejected).toBe('refunded')
  })
})
