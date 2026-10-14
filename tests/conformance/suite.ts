import { describe, it, expect } from 'vitest'
import {
  isVerifiedPayment,
  moneyEquals,
  moneyFromDecimal,
  NepalPaymentsError,
  PaymentError,
  VerificationError,
} from '@nepal-payments/core'
import type { PaymentMethod, VerifiedPayment } from '@nepal-payments/core'
import type { GatewayConformanceDriver } from './driver.js'

async function capture(fn: () => unknown | Promise<unknown>): Promise<unknown> {
  try {
    return await fn()
  } catch (error) {
    return error
  }
}

function expectGatewayError(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(NepalPaymentsError)
  expect((error as NepalPaymentsError).code).toBe(code)
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === 'AbortError'
  if (error instanceof Error) return error.name === 'AbortError'
  return false
}

/** A gateway name that is definitely not the driver's own. */
function foreignGateway(driver: GatewayConformanceDriver): PaymentMethod {
  return driver.name === 'khalti' ? 'esewa' : 'khalti'
}

/**
 * The shared gateway contract. Every gateway adapter must pass this suite;
 * drivers only provide gateway-specific payload construction and upstream
 * stubbing.
 */
export function runGatewayConformanceSuite(
  driver: GatewayConformanceDriver
): void {
  describe(`${driver.name} conformance`, () => {
    // ---------- capability 1: create checkout ----------

    describe('create checkout', () => {
      it('returns a checkout and a matching txnRef', async () => {
        const gateway = driver.createGateway()
        const result = await gateway.createCheckout(driver.order)
        expect(['redirect', 'form_post']).toContain(result.checkout.type)
        expect(typeof result.checkout.url).toBe('string')
        expect(result.checkout.url.length).toBeGreaterThan(0)
        expect(result.txnRef.gateway).toBe(driver.name)
        expect(result.txnRef.id.length).toBeGreaterThan(0)
      })

      it('issues distinct transaction ids for distinct orders', async () => {
        const gateway = driver.createGateway()
        const first = await gateway.createCheckout(driver.order)
        const second = await gateway.createCheckout({
          ...driver.order,
          id: 'ORD-CONFORM-0002',
        })
        expect(first.txnRef.id).not.toBe(second.txnRef.id)
      })
    })

    // ---------- capability 2: parse callback ----------

    describe('parse callback', () => {
      it('parses the gateway callback into an unverified payload', async () => {
        const gateway = driver.createGateway()
        const { txnRef } = await driver.paidCheckout(gateway)
        const raw = await driver.completedCallback(gateway, txnRef)
        const callback = gateway.parseCallback(raw)
        expect(callback.gateway).toBe(driver.name)
        expect(typeof callback.data).toBe('object')
        expect(callback.data).not.toBeNull()
        expect(Object.keys(callback.data).length).toBeGreaterThan(0)
      })

      it('rejects an empty request as MALFORMED_CALLBACK', async () => {
        const gateway = driver.createGateway()
        const error = await capture(() => gateway.parseCallback({}))
        expect(error).toBeInstanceOf(PaymentError)
        expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
      })

      it('rejects a callback with no query data', async () => {
        const gateway = driver.createGateway()
        const error = await capture(() => gateway.parseCallback({ query: {} }))
        expect(error).toBeInstanceOf(PaymentError)
        expect((error as PaymentError).code).toBe('MALFORMED_CALLBACK')
      })
    })

    // ---------- capability 3: verify callback ----------

    describe('verify callback', () => {
      it('seals a valid completed callback', async () => {
        const gateway = driver.createGateway()
        const { txnRef } = await driver.paidCheckout(gateway)
        const raw = await driver.completedCallback(gateway, txnRef)
        const payment = await gateway.verify(gateway.parseCallback(raw), {
          expected: driver.order,
        })
        expect(isVerifiedPayment(payment)).toBe(true)
        expect(payment.status).toBe('completed')
        expect(payment.orderId).toBe(driver.order.id)
        expect(payment.txnRef.gateway).toBe(driver.name)
        expect(moneyEquals(payment.amount, driver.order.amount)).toBe(true)
      })

      it('rejects a callback for a different gateway', async () => {
        const gateway = driver.createGateway()
        const { txnRef } = await driver.paidCheckout(gateway)
        const raw = await driver.completedCallback(gateway, txnRef)
        const parsed = gateway.parseCallback(raw)
        const foreign = { ...parsed, gateway: foreignGateway(driver) }
        const error = await capture(() =>
          gateway.verify(foreign, { expected: driver.order })
        )
        expect(error).toBeInstanceOf(VerificationError)
        expect((error as VerificationError).code).toBe('GATEWAY_MISMATCH')
      })
    })

    // ---------- capability 4: reject tampering ----------

    describe('reject tampering', () => {
      it('rejects a tampered amount with AMOUNT_MISMATCH', async () => {
        const gateway = driver.createGateway()
        const { txnRef } = await driver.paidCheckout(gateway)
        const raw = await driver.tamperedAmount(gateway, txnRef)
        const error = await capture(() =>
          gateway.verify(gateway.parseCallback(raw), {
            expected: driver.order,
          })
        )
        expectGatewayError(error, 'AMOUNT_MISMATCH')
      })

      it('rejects a tampered order id with ORDER_MISMATCH', async () => {
        const gateway = driver.createGateway()
        const { txnRef } = await driver.paidCheckout(gateway)
        const raw = await driver.tamperedOrder(gateway, txnRef)
        const error = await capture(() =>
          gateway.verify(gateway.parseCallback(raw), {
            expected: driver.order,
          })
        )
        expectGatewayError(error, 'ORDER_MISMATCH')
      })

      const tamperedSignature = driver.tamperedSignature
      if (tamperedSignature !== undefined) {
        it('rejects a broken signature with SIGNATURE_MISMATCH', async () => {
          const gateway = driver.createGateway()
          const { txnRef } = await driver.paidCheckout(gateway)
          const raw = await tamperedSignature(gateway, txnRef)
          const error = await capture(() =>
            gateway.verify(gateway.parseCallback(raw), {
              expected: driver.order,
            })
          )
          expectGatewayError(error, 'SIGNATURE_MISMATCH')
        })
      }

      it('never seals tampered callbacks as completed', async () => {
        const gateway = driver.createGateway()
        const { txnRef } = await driver.paidCheckout(gateway)
        const tampered = await driver.tamperedAmount(gateway, txnRef)
        const result = await capture(() =>
          gateway.verify(gateway.parseCallback(tampered), {
            expected: driver.order,
          })
        )
        expect(result).toBeInstanceOf(Error)
      })
    })

    // ---------- capability 5: verify amount ----------

    describe('verify amount', () => {
      it('seals the exact expected amount', async () => {
        const gateway = driver.createGateway()
        const { txnRef } = await driver.paidCheckout(gateway)
        const raw = await driver.completedCallback(gateway, txnRef)
        const payment = await gateway.verify(gateway.parseCallback(raw), {
          expected: driver.order,
        })
        expect(payment.amount).toEqual(driver.order.amount)
        expect(payment.amount.amount).toBe(driver.order.amount.amount)
      })

      it('verifies across equivalent Money precisions', async () => {
        const gateway = driver.createGateway()
        const { txnRef } = await driver.paidCheckout(gateway)
        const raw = await driver.completedCallback(gateway, txnRef)
        const zeroPrecision = moneyFromDecimal('230', 'NPR', 0)
        const payment = await gateway.verify(gateway.parseCallback(raw), {
          expected: { ...driver.order, amount: zeroPrecision },
        })
        expect(payment.status).toBe('completed')
        expect(moneyEquals(payment.amount, driver.order.amount)).toBe(true)
      })
    })

    // ---------- capability 6: verify order ----------

    describe('verify order', () => {
      it('seals the expected order id', async () => {
        const gateway = driver.createGateway()
        const { txnRef } = await driver.paidCheckout(gateway)
        const raw = await driver.completedCallback(gateway, txnRef)
        const payment = await gateway.verify(gateway.parseCallback(raw), {
          expected: driver.order,
        })
        expect(payment.orderId).toBe(driver.order.id)
      })

      it('rejects verification against a different expected order', async () => {
        const gateway = driver.createGateway()
        const { txnRef } = await driver.paidCheckout(gateway)
        const raw = await driver.completedCallback(gateway, txnRef)
        const error = await capture(() =>
          gateway.verify(gateway.parseCallback(raw), {
            expected: { ...driver.order, id: 'ORD-OTHER-9999' },
          })
        )
        expectGatewayError(error, 'ORDER_MISMATCH')
      })
    })

    // ---------- capability 7: status lookup ----------

    describe('status lookup', () => {
      it('reports completed for a paid transaction with an expected order', async () => {
        const gateway = driver.createGateway()
        const { txnRef } = await driver.paidCheckout(gateway)
        const payment = await gateway.status(txnRef, {
          expected: driver.order,
        })
        expect(payment.status).toBe('completed')
        expect(payment.orderId).toBe(driver.order.id)
        expect(moneyEquals(payment.amount, driver.order.amount)).toBe(true)
        expect(payment.txnRef.gateway).toBe(driver.name)
        expect(payment.txnRef.id.length).toBeGreaterThan(0)
      })

      it.skipIf(driver.statusWithoutExpected === false)(
        'reports a positive amount and status without an expected order',
        async () => {
          const gateway = driver.createGateway()
          const { txnRef } = await driver.paidCheckout(gateway)
          const payment = await gateway.status(txnRef)
          expect(payment.status).toBe('completed')
          expect(payment.amount.amount).toBeGreaterThan(0n)
          expect(payment.orderId.length).toBeGreaterThan(0)
          const expectedOrderId =
            driver.orderIdWithoutExpected === 'order'
              ? driver.order.id
              : txnRef.id
          expect(payment.orderId).toBe(expectedOrderId)
        }
      )

      it('rejects a status lookup for another gateway', async () => {
        const gateway = driver.createGateway()
        const foreign = {
          ...driver.unknownTxnRef,
          gateway: foreignGateway(driver),
        }
        const error = await capture(() => gateway.status(foreign))
        expect(error).toBeInstanceOf(VerificationError)
        expect((error as VerificationError).code).toBe('GATEWAY_MISMATCH')
      })

      it('rejects a malformed transaction id', async () => {
        const gateway = driver.createGateway()
        const error = await capture(() =>
          gateway.status({ id: 'not a valid id!', gateway: driver.name })
        )
        expectGatewayError(error, 'INVALID_TXN_REF')
      })
    })

    // ---------- capability 8: normalize statuses ----------

    describe('normalize statuses', () => {
      for (const sample of driver.statusSamples) {
        it(`maps native "${sample.native}" to "${sample.unified}"`, async () => {
          const gateway = driver.createGateway()
          const { txnRef } = await driver.paidCheckout(gateway)
          await driver.setStatus(gateway, txnRef, sample.native)
          const payment = await gateway.status(txnRef, {
            expected: driver.order,
          })
          expect(payment.status).toBe(sample.unified)
        })
      }
    })

    // ---------- capability 9: handle errors ----------

    describe('handle errors', () => {
      it('aborts a lookup that never responds', async () => {
        const gateway = driver.createGateway()
        const { txnRef } = await driver.paidCheckout(gateway)
        const hanging = driver.hangingGateway()
        const error = await capture(() =>
          hanging.status(txnRef, { expected: driver.order })
        )
        expect(error).toBeInstanceOf(Error)
        expect(isAbortError(error)).toBe(true)
      })

      it('handles a transaction the gateway does not know', async () => {
        const gateway = driver.createGateway()
        const error = await capture(() =>
          gateway.status(driver.unknownTxnRef, { expected: driver.order })
        )
        const outcome = driver.unknownTransaction
        if (outcome.kind === 'throws') {
          expect(error).toBeInstanceOf(NepalPaymentsError)
          expect((error as NepalPaymentsError).code).toBe(outcome.code)
        } else {
          expect(error).not.toBeInstanceOf(Error)
          expect((error as VerifiedPayment).status).toBe(outcome.status)
        }
      })

      it('handles server-side disagreement with a completed callback', async () => {
        const gateway = driver.createGateway()
        const { txnRef } = await driver.paidCheckout(gateway)
        const raw = await driver.completedCallback(gateway, txnRef)
        const callback = gateway.parseCallback(raw)
        await driver.setUpstreamDisagreement(gateway, txnRef)
        const outcome = driver.disagreement
        const result = await capture(() =>
          gateway.verify(callback, { expected: driver.order })
        )
        if (outcome.kind === 'throws') {
          expect(result).toBeInstanceOf(NepalPaymentsError)
          expect((result as NepalPaymentsError).code).toBe(outcome.code)
        } else {
          expect(result).not.toBeInstanceOf(Error)
          expect((result as VerifiedPayment).status).toBe(outcome.status)
        }
      })

      it('rejects a completed payment claim when the status lookup disagrees', async () => {
        const gateway = driver.createGateway()
        const { txnRef } = await driver.paidCheckout(gateway)
        const raw = await driver.completedCallback(gateway, txnRef)
        const callback = gateway.parseCallback(raw)
        await driver.setUpstreamDisagreement(gateway, txnRef)
        const result = await capture(() =>
          gateway.verify(callback, { expected: driver.order })
        )
        const sealed =
          result !== undefined && !(result instanceof Error)
            ? (result as VerifiedPayment).status
            : undefined
        expect(sealed === 'completed' ? 'completed' : 'not-completed').toBe(
          'not-completed'
        )
      })
    })
  })
}
