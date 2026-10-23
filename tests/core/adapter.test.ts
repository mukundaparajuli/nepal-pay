import { describe, it, expect } from 'vitest'
import {
  isVerifiedPayment,
  moneyFromDecimal,
  moneyToDecimal,
  sha256,
  verifySha256,
  VerificationError,
  type CheckoutResult,
  type GatewayAdapter,
  type Order,
  type PaymentMethod,
  type RawCallbackRequest,
  type TxnRef,
  type UnverifiedCallback,
  type VerifyOptions,
  type VerifiedPayment,
} from '@nepal-pay/core'
import { createVerifiedPayment } from '@nepal-pay/core/internal'

const MOCK_SECRET = 'test-secret'
const MOCK_GATEWAY: PaymentMethod = 'connectips'

const sign = (orderId: string, amount: string): Promise<string> =>
  sha256(`${orderId}:${amount}:${MOCK_SECRET}`)

class MockGateway implements GatewayAdapter {
  readonly name = MOCK_GATEWAY
  private readonly receipts = new Map<string, VerifiedPayment>()

  async createCheckout(order: Order): Promise<CheckoutResult> {
    return {
      checkout: {
        type: 'redirect',
        url: `https://mock.example/pay?orderId=${encodeURIComponent(order.id)}&amount=${moneyToDecimal(order.amount)}`,
      },
      txnRef: { id: `TXN-${order.id}`, gateway: this.name },
    }
  }

  parseCallback(request: RawCallbackRequest): UnverifiedCallback {
    const body =
      typeof request.body === 'object' &&
      request.body !== null &&
      !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {}
    return {
      gateway: this.name,
      data: { ...(request.query ?? {}), ...body },
      headers: request.headers,
      body: request.body,
    }
  }

  async verify(
    callback: UnverifiedCallback,
    options: VerifyOptions
  ): Promise<VerifiedPayment> {
    if (callback.gateway !== this.name) {
      throw new VerificationError(
        'Callback is not for this gateway',
        'GATEWAY_MISMATCH'
      )
    }

    const orderId = String(callback.data.orderId ?? '')
    const amount = String(callback.data.amount ?? '')
    const signature = String(callback.data.signature ?? '')

    if (options.expected.id !== orderId) {
      throw new VerificationError('Order mismatch', 'ORDER_MISMATCH')
    }
    if (moneyToDecimal(options.expected.amount) !== amount) {
      throw new VerificationError('Amount mismatch', 'AMOUNT_MISMATCH')
    }
    if (
      !(await verifySha256(`${orderId}:${amount}:${MOCK_SECRET}`, signature))
    ) {
      throw new VerificationError('Signature mismatch', 'SIGNATURE_MISMATCH')
    }

    const payment = createVerifiedPayment({
      __unverified: true,
      orderId,
      amount: moneyFromDecimal(amount),
      status: 'completed',
      txnRef: { id: `TXN-${orderId}`, gateway: this.name },
    })
    this.receipts.set(payment.txnRef.id, payment)
    return payment
  }

  async status(txnRef: TxnRef): Promise<VerifiedPayment> {
    if (txnRef.gateway !== this.name) {
      throw new VerificationError(
        'Transaction belongs to another gateway',
        'GATEWAY_MISMATCH'
      )
    }
    const payment = this.receipts.get(txnRef.id)
    if (!payment) {
      throw new VerificationError('Unknown transaction', 'UNKNOWN_TRANSACTION')
    }
    return payment
  }
}

const order: Order = {
  id: 'ORD001',
  amount: moneyFromDecimal('100.00'),
  description: 'Test order',
}
const validOptions: VerifyOptions = {
  expected: order,
}

const validCallback = async (): Promise<UnverifiedCallback> => ({
  gateway: MOCK_GATEWAY,
  data: {
    orderId: 'ORD001',
    amount: '100.00',
    signature: await sign('ORD001', '100.00'),
  },
})

describe('GatewayAdapter', () => {
  const gateway = new MockGateway()

  it('uses a supported payment method as its name', () => {
    expect(gateway.name).toBe('connectips')
  })

  describe('createCheckout', () => {
    it('returns a redirect checkout and a transaction reference', async () => {
      const result = await gateway.createCheckout(order)
      expect(result.checkout.type).toBe('redirect')
      expect(result.checkout.url).toContain('orderId=ORD001')
      expect(result.checkout.url).toContain('amount=100.00')
      expect(result.txnRef).toEqual({ id: 'TXN-ORD001', gateway: 'connectips' })
    })
  })

  describe('parseCallback', () => {
    it('tags raw request data as an untrusted callback', () => {
      const request: RawCallbackRequest = {
        query: { orderId: 'ORD001' },
        body: { amount: '100.00' },
        headers: { 'content-type': 'application/json' },
      }
      const callback = gateway.parseCallback(request)
      expect(callback.gateway).toBe('connectips')
      expect(callback.data).toEqual({ orderId: 'ORD001', amount: '100.00' })
      expect(callback.headers).toEqual({ 'content-type': 'application/json' })
      expect(callback.body).toEqual({ amount: '100.00' })
      expect(isVerifiedPayment(callback)).toBe(false)
    })

    it('prefers body over query on conflict', () => {
      const callback = gateway.parseCallback({
        query: { amount: '1.00' },
        body: { amount: '100.00' },
      })
      expect(callback.data.amount).toBe('100.00')
    })

    it('accepts query-only requests', () => {
      const callback = gateway.parseCallback({ query: { orderId: 'ORD001' } })
      expect(callback.data).toEqual({ orderId: 'ORD001' })
      expect(callback.headers).toBeUndefined()
      expect(callback.body).toBeUndefined()
    })

    it('ignores non-object bodies when merging data', () => {
      const callback = gateway.parseCallback({
        query: { orderId: 'ORD001' },
        body: 'not-an-object',
      })
      expect(callback.data).toEqual({ orderId: 'ORD001' })
      expect(callback.body).toBe('not-an-object')
    })
  })

  describe('verify', () => {
    it('verifies amount, order, and signature into a sealed payment', async () => {
      const payment = await gateway.verify(await validCallback(), validOptions)
      expect(isVerifiedPayment(payment)).toBe(true)
      expect(payment.orderId).toBe('ORD001')
      expect(payment.amount.amount).toBe(10000n)
      expect(payment.status).toBe('completed')
      expect(payment.txnRef).toEqual({
        id: 'TXN-ORD001',
        gateway: 'connectips',
      })
      expect(payment.verifiedAt).toBeInstanceOf(Date)
    })

    it('rejects callbacks tagged for another gateway', async () => {
      const base = await validCallback()
      const callback: UnverifiedCallback = { ...base, gateway: 'khalti' }
      await expect(gateway.verify(callback, validOptions)).rejects.toThrow(
        VerificationError
      )
    })

    it('rejects amount mismatches', async () => {
      const base = await validCallback()
      const callback: UnverifiedCallback = {
        ...base,
        data: { ...base.data, amount: '1.00' },
      }
      await expect(gateway.verify(callback, validOptions)).rejects.toThrow(
        /Amount mismatch/
      )
    })

    it('rejects order mismatches', async () => {
      const callback: UnverifiedCallback = {
        gateway: MOCK_GATEWAY,
        data: {
          orderId: 'ORD-HACK',
          amount: '100.00',
          signature: await sign('ORD-HACK', '100.00'),
        },
      }
      await expect(gateway.verify(callback, validOptions)).rejects.toThrow(
        /Order mismatch/
      )
    })

    it('rejects verification bound to a different expected order', async () => {
      await expect(
        gateway.verify(await validCallback(), {
          expected: { ...order, id: 'ORD002' },
        })
      ).rejects.toThrow(/Order mismatch/)
    })

    it('rejects invalid signatures', async () => {
      const base = await validCallback()
      const callback: UnverifiedCallback = {
        ...base,
        data: { ...base.data, signature: await sha256('forged') },
      }
      await expect(gateway.verify(callback, validOptions)).rejects.toThrow(
        /Signature mismatch/
      )
    })
  })

  describe('status', () => {
    it('returns the sealed payment for a known transaction', async () => {
      await gateway.verify(await validCallback(), validOptions)
      const payment = await gateway.status({
        id: 'TXN-ORD001',
        gateway: 'connectips',
      })
      expect(isVerifiedPayment(payment)).toBe(true)
      expect(payment.status).toBe('completed')
    })

    it('rejects unknown transactions', async () => {
      await expect(
        gateway.status({ id: 'TXN-MISSING', gateway: 'connectips' })
      ).rejects.toThrow(VerificationError)
    })

    it('rejects transaction refs from other gateways', async () => {
      await expect(
        gateway.status({ id: 'TXN-ORD001', gateway: 'khalti' })
      ).rejects.toThrow(VerificationError)
    })
  })

  it('requires every gateway to implement all four methods', () => {
    // @ts-expect-error a gateway must implement createCheckout, parseCallback, verify, and status
    class IncompleteGateway implements GatewayAdapter {
      readonly name: PaymentMethod = 'esewa'
    }
    expect(new IncompleteGateway().name).toBe('esewa')
  })
})
