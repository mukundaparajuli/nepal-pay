import { describe, it, expect } from 'vitest'
import {
  isCompletedPayment,
  isVerifiedPayment,
  moneyFromDecimal,
  PaymentError,
  type Money,
  type PaymentMethod,
  type UnverifiedCallback,
  type VerifiedPayment,
} from '@nepal-payments/core'
import {
  createVerifiedPayment,
  type VerifiedPaymentInput,
} from '@nepal-payments/core/internal'

const validInput = (): VerifiedPaymentInput => ({
  __unverified: true,
  orderId: 'ORD001',
  amount: moneyFromDecimal('100.00'),
  status: 'completed',
  txnRef: { id: 'TXN123', gateway: 'esewa' },
})

describe('createVerifiedPayment', () => {
  it('creates a verified payment from valid input', () => {
    const payment = createVerifiedPayment(validInput())
    expect(payment.orderId).toBe('ORD001')
    expect(payment.amount.amount).toBe(10000n)
    expect(payment.status).toBe('completed')
    expect(payment.txnRef).toEqual({ id: 'TXN123', gateway: 'esewa' })
    expect(isVerifiedPayment(payment)).toBe(true)
  })

  it('omits raw when not provided', () => {
    const payment = createVerifiedPayment(validInput())
    expect('raw' in payment).toBe(false)
  })

  it('includes raw when provided', () => {
    const payment = createVerifiedPayment({
      ...validInput(),
      raw: { ref: 'R1' },
    })
    expect(payment.raw).toEqual({ ref: 'R1' })
  })

  it('records a verifiedAt timestamp', () => {
    const before = Date.now()
    const payment = createVerifiedPayment(validInput())
    expect(payment.verifiedAt).toBeInstanceOf(Date)
    expect(payment.verifiedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(payment.verifiedAt.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('accepts every payment state', () => {
    for (const status of [
      'pending',
      'completed',
      'failed',
      'canceled',
      'expired',
      'unknown',
    ] as const) {
      const payment = createVerifiedPayment({ ...validInput(), status })
      expect(payment.status).toBe(status)
    }
  })

  it('rejects an empty orderId', () => {
    expect(() =>
      createVerifiedPayment({ ...validInput(), orderId: '' })
    ).toThrow(PaymentError)
  })

  it('rejects a non-Money amount', () => {
    const input = { ...validInput(), amount: '100.00' as unknown as Money }
    expect(() => createVerifiedPayment(input)).toThrow(PaymentError)
  })

  it('rejects a zero amount', () => {
    expect(() =>
      createVerifiedPayment({
        ...validInput(),
        amount: moneyFromDecimal('0.00'),
      })
    ).toThrow(PaymentError)
  })

  it('rejects a negative amount', () => {
    expect(() =>
      createVerifiedPayment({
        ...validInput(),
        amount: moneyFromDecimal('-100.00'),
      })
    ).toThrow(PaymentError)
  })

  it('rejects an invalid status', () => {
    const input = {
      ...validInput(),
      status: 'refunded',
    } as unknown as VerifiedPaymentInput
    expect(() => createVerifiedPayment(input)).toThrow(PaymentError)
    expect(() => createVerifiedPayment(input)).toThrow(/Invalid payment status/)
  })

  it('rejects an invalid txnRef', () => {
    expect(() =>
      createVerifiedPayment({
        ...validInput(),
        txnRef: { id: '', gateway: 'esewa' },
      })
    ).toThrow(PaymentError)
  })

  it('rejects a txnRef for an unsupported gateway', () => {
    expect(() =>
      createVerifiedPayment({
        ...validInput(),
        txnRef: {
          id: 'TXN1',
          gateway: 'mock-gateway' as unknown as PaymentMethod,
        },
      })
    ).toThrow(PaymentError)
  })

  it('rejects input without the __unverified marker at runtime', () => {
    const input: VerifiedPaymentInput = { ...validInput() }
    delete (input as { __unverified?: true }).__unverified
    expect(() => createVerifiedPayment(input)).toThrow(PaymentError)
  })
})

describe('isCompletedPayment', () => {
  it('is true only for sealed, completed payments', () => {
    expect(isCompletedPayment(createVerifiedPayment(validInput()))).toBe(true)
    expect(
      isCompletedPayment(
        createVerifiedPayment({ ...validInput(), status: 'pending' })
      )
    ).toBe(false)
    expect(isCompletedPayment({ orderId: 'ORD001' })).toBe(false)
    expect(isCompletedPayment(null)).toBe(false)
  })
})

describe('seal hardening (T1, T3)', () => {
  it('drops the seal when spread into a new object', () => {
    const payment = createVerifiedPayment(validInput())
    const spread: unknown = { ...payment }
    expect(isVerifiedPayment(spread)).toBe(false)
  })

  it('drops the seal through JSON serialization', () => {
    const payment = createVerifiedPayment(validInput())
    const json = JSON.stringify(payment, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value
    )
    const roundTripped: unknown = JSON.parse(json)
    expect(isVerifiedPayment(roundTripped)).toBe(false)
  })

  it('rejects a symbol stamped through plain assignment', () => {
    const payment = createVerifiedPayment(validInput())
    const brand = Object.getOwnPropertySymbols(payment).at(0)
    expect(brand).toBeDefined()
    const forged: Record<PropertyKey, unknown> = { orderId: 'ORD001' }
    if (brand !== undefined) {
      forged[brand] = true
    }
    expect(isVerifiedPayment(forged)).toBe(false)
  })

  it('documents the known limitation: defineProperty can re-stamp a stolen symbol', () => {
    const payment = createVerifiedPayment(validInput())
    const brand = Object.getOwnPropertySymbols(payment).at(0)
    const forged: Record<PropertyKey, unknown> = { orderId: 'ORD001' }
    if (brand !== undefined) {
      Object.defineProperty(forged, brand, {
        value: true,
        enumerable: false,
        writable: false,
        configurable: false,
      })
    }
    expect(isVerifiedPayment(forged)).toBe(true)
  })

  it('rejects plain lookalikes without the seal', () => {
    expect(isVerifiedPayment({ ...validInput() })).toBe(false)
    expect(isVerifiedPayment(null)).toBe(false)
    expect(isVerifiedPayment(undefined)).toBe(false)
    expect(isVerifiedPayment('completed')).toBe(false)
    expect(isVerifiedPayment({ status: 'completed' })).toBe(false)
  })

  it('drops unknown extra keys instead of sealing them', () => {
    const input = {
      ...validInput(),
      elevated: true,
      role: 'admin',
    } as unknown as VerifiedPaymentInput
    const payment = createVerifiedPayment(input) as unknown as Record<
      string,
      unknown
    >
    expect('elevated' in payment).toBe(false)
    expect('role' in payment).toBe(false)
    expect(isVerifiedPayment(payment)).toBe(true)
  })

  it('freezes the payment and its nested values', () => {
    const payment = createVerifiedPayment(validInput())
    expect(Object.isFrozen(payment)).toBe(true)
    expect(Object.isFrozen(payment.amount)).toBe(true)
    expect(Object.isFrozen(payment.txnRef)).toBe(true)
    expect(Object.isFrozen(payment.verifiedAt)).toBe(true)
    expect(() => {
      const mutable = payment as unknown as { orderId: string }
      mutable.orderId = 'ORD-HACK'
    }).toThrow(TypeError)
    expect(() => {
      const mutable = payment as unknown as { status: string }
      mutable.status = 'failed'
    }).toThrow(TypeError)
  })

  it('deep-freezes raw data', () => {
    const payment = createVerifiedPayment({
      ...validInput(),
      raw: { nested: { hits: 1 } },
    })
    const nested = payment.raw?.nested as { hits: number }
    expect(() => {
      nested.hits = 2
    }).toThrow(TypeError)
  })

  it('isolates raw data from later mutation of the source object', () => {
    const source = { nested: { hits: 1 } }
    const payment = createVerifiedPayment({
      ...validInput(),
      raw: source,
    })
    source.nested.hits = 99
    const nested = payment.raw?.nested as { hits: number }
    expect(nested.hits).toBe(1)
  })

  it('rejects non-cloneable raw data', () => {
    const input = {
      ...validInput(),
      raw: { fn: () => 0 },
    } as unknown as VerifiedPaymentInput
    expect(() => createVerifiedPayment(input)).toThrow(PaymentError)
  })
})

describe('trust boundary between callbacks and payments', () => {
  it('accepts untrusted callback data as a plain object', () => {
    const callback: UnverifiedCallback = {
      gateway: 'esewa',
      data: { amt: '100.00', refId: '77' },
    }
    expect(callback.gateway).toBe('esewa')
    expect(callback.data.refId).toBe('77')
    expect(isVerifiedPayment(callback)).toBe(false)
  })

  it('does not treat plain lookalike objects as verified payments', () => {
    expect(isVerifiedPayment({ ...validInput() })).toBe(false)
    expect(isVerifiedPayment(null)).toBe(false)
    expect(isVerifiedPayment(undefined)).toBe(false)
    expect(isVerifiedPayment('completed')).toBe(false)
    expect(isVerifiedPayment({ status: 'completed' })).toBe(false)
  })

  it('cannot be forged as a plain object literal', () => {
    // @ts-expect-error the verification seal cannot be set outside this package
    const forged: VerifiedPayment = {
      orderId: 'ORD001',
      amount: moneyFromDecimal('100.00'),
      status: 'completed',
      txnRef: { id: 'TXN123', gateway: 'esewa' },
      verifiedAt: new Date(),
    }
    expect(isVerifiedPayment(forged)).toBe(false)
  })

  it('cannot be reached by casting a factory input (Y2)', () => {
    const input = validInput()
    // @ts-expect-error VerifiedPaymentInput is not castable to VerifiedPayment
    const payment = input as VerifiedPayment
    expect(isVerifiedPayment(payment)).toBe(false)
  })

  it('rejects an unverified callback where a payment is expected', () => {
    const callback: UnverifiedCallback = {
      gateway: 'khalti',
      data: { amt: '100.00' },
    }
    const acceptsPayment = (payment: VerifiedPayment): boolean =>
      isVerifiedPayment(payment)
    // @ts-expect-error an UnverifiedCallback must never be accepted as a VerifiedPayment
    acceptsPayment(callback)
    expect(acceptsPayment(createVerifiedPayment(validInput()))).toBe(true)
  })

  it('rejects a verified payment where an unverified callback is expected', () => {
    const payment = createVerifiedPayment(validInput())
    const acceptsCallback = (callback: UnverifiedCallback): string =>
      callback.gateway
    // @ts-expect-error a VerifiedPayment must never be accepted as an UnverifiedCallback
    acceptsCallback(payment)
    expect(acceptsCallback({ gateway: 'esewa', data: {} })).toBe('esewa')
  })
})
