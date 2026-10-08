import { describe, it, expect } from 'vitest'
import {
  constantTimeCompare,
  createVerifiedPayment,
  isVerifiedPayment,
  moneyFromDecimal,
  moneyToDecimal,
  sha256,
  VerificationError,
  type CheckoutResult,
  type GatewayAdapter,
  type Order,
  type RawCallbackRequest,
  type TxnRef,
  type UnverifiedCallback,
  type VerifyOptions,
  type VerifiedPayment,
  type VerifiedPaymentInput,
} from '@nepal-payments/core'

const MOCK_SECRET = 'test-secret'

const sign = (orderId: string, amount: string): string =>
  sha256(`${orderId}:${amount}:${MOCK_SECRET}`)

class MockGateway implements GatewayAdapter {
  readonly name = 'mock'
  private readonly receipts = new Map<string, VerifiedPaymentInput>()

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
    return {
      gateway: this.name,
      data: { ...(request.query ?? {}), ...(request.body ?? {}) },
      headers: request.headers,
    }
  }

  async verify(
    callback: UnverifiedCallback,
    options?: VerifyOptions
  ): Promise<VerifiedPayment> {
    if (callback.gateway !== this.name) {
      throw new VerificationError('Callback is not for this gateway')
    }

    const orderId = String(callback.data.orderId ?? '')
    const amount = String(callback.data.amount ?? '')
    const signature = String(callback.data.signature ?? '')

    if (String(options?.expectedOrderId) !== orderId) {
      throw new VerificationError('Order mismatch')
    }
    if (String(options?.expectedAmount) !== amount) {
      throw new VerificationError('Amount mismatch')
    }
    if (!constantTimeCompare(signature, sign(orderId, amount))) {
      throw new VerificationError('Signature mismatch')
    }

    const input: VerifiedPaymentInput = {
      orderId,
      amount: moneyFromDecimal(amount),
      status: 'completed',
      txnRef: { id: `TXN-${orderId}`, gateway: this.name },
    }
    const payment = createVerifiedPayment(input)
    this.receipts.set(payment.txnRef.id, input)
    return payment
  }

  async status(txnRef: TxnRef): Promise<VerifiedPayment> {
    if (txnRef.gateway !== this.name) {
      throw new VerificationError('Transaction belongs to another gateway')
    }
    const input = this.receipts.get(txnRef.id)
    if (!input) {
      throw new VerificationError('Unknown transaction')
    }
    return createVerifiedPayment(input)
  }
}

const order: Order = {
  id: 'ORD001',
  amount: moneyFromDecimal('100.00'),
  description: 'Test order',
}
const validOptions: VerifyOptions = {
  expectedOrderId: 'ORD001',
  expectedAmount: '100.00',
}

const validCallback = (): UnverifiedCallback => ({
  gateway: 'mock',
  data: {
    orderId: 'ORD001',
    amount: '100.00',
    signature: sign('ORD001', '100.00'),
  },
})

describe('GatewayAdapter', () => {
  const gateway = new MockGateway()

  describe('createCheckout', () => {
    it('returns a redirect checkout and a transaction reference', async () => {
      const result = await gateway.createCheckout(order)
      expect(result.checkout.type).toBe('redirect')
      expect(result.checkout.url).toContain('orderId=ORD001')
      expect(result.checkout.url).toContain('amount=100.00')
      expect(result.txnRef).toEqual({ id: 'TXN-ORD001', gateway: 'mock' })
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
      expect(callback.gateway).toBe('mock')
      expect(callback.data).toEqual({ orderId: 'ORD001', amount: '100.00' })
      expect(callback.headers).toEqual({ 'content-type': 'application/json' })
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
    })
  })

  describe('verify', () => {
    it('verifies amount, order, and signature into a sealed payment', async () => {
      const payment = await gateway.verify(validCallback(), validOptions)
      expect(isVerifiedPayment(payment)).toBe(true)
      expect(payment.orderId).toBe('ORD001')
      expect(payment.amount.amount).toBe(10000n)
      expect(payment.status).toBe('completed')
      expect(payment.txnRef).toEqual({ id: 'TXN-ORD001', gateway: 'mock' })
    })

    it('rejects callbacks tagged for another gateway', async () => {
      const callback: UnverifiedCallback = {
        ...validCallback(),
        gateway: 'khalti',
      }
      await expect(gateway.verify(callback, validOptions)).rejects.toThrow(
        VerificationError
      )
    })

    it('rejects amount mismatches', async () => {
      const base = validCallback()
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
        gateway: 'mock',
        data: {
          orderId: 'ORD-HACK',
          amount: '100.00',
          signature: sign('ORD-HACK', '100.00'),
        },
      }
      await expect(gateway.verify(callback, validOptions)).rejects.toThrow(
        /Order mismatch/
      )
    })

    it('rejects invalid signatures', async () => {
      const base = validCallback()
      const callback: UnverifiedCallback = {
        ...base,
        data: { ...base.data, signature: sha256('forged') },
      }
      await expect(gateway.verify(callback, validOptions)).rejects.toThrow(
        /Signature mismatch/
      )
    })
  })

  describe('status', () => {
    it('returns the sealed payment for a known transaction', async () => {
      await gateway.verify(validCallback(), validOptions)
      const payment = await gateway.status({
        id: 'TXN-ORD001',
        gateway: 'mock',
      })
      expect(isVerifiedPayment(payment)).toBe(true)
      expect(payment.status).toBe('completed')
    })

    it('rejects unknown transactions', async () => {
      await expect(
        gateway.status({ id: 'TXN-MISSING', gateway: 'mock' })
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
      readonly name = 'incomplete'
    }
    expect(new IncompleteGateway().name).toBe('incomplete')
  })
})
