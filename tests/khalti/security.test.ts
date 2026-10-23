import { it, expect } from 'vitest'
import {
  VerificationError,
  callbackFingerprint,
  isVerifiedPayment,
  type UnverifiedCallback,
} from '@nepal-pay/core'
import {
  COMPLETED_PIDX,
  COMPLETED_TXN,
  SANDBOX_SECRET,
  captureError,
  order,
  stubRequest,
  testGateway,
} from './helpers.js'

function completedLookup(overrides: Record<string, unknown> = {}) {
  return {
    pidx: COMPLETED_PIDX,
    total_amount: 23000,
    status: 'Completed',
    transaction_id: COMPLETED_TXN,
    fee: 0,
    refunded: false,
    ...overrides,
  }
}

function successCallback(overrides: Record<string, unknown> = {}) {
  return {
    gateway: 'khalti' as const,
    data: {
      pidx: COMPLETED_PIDX,
      status: 'Completed',
      transaction_id: COMPLETED_TXN,
      tidx: COMPLETED_TXN,
      amount: '23000',
      total_amount: '23000',
      mobile: '98XXXXX904',
      purchase_order_id: 'ORD001',
      purchase_order_name: 'Consultation',
      ...overrides,
    },
  }
}

it('never discloses the secret key in errors', async () => {
  const gateway = testGateway({
    fetch: stubRequest(() => ({
      status: 401,
      body: { detail: 'Invalid token.', status_code: 401 },
    })).fetch,
  })
  const error = await captureError(() =>
    gateway.verify(successCallback(), { expected: order() })
  )
  expect(error).toBeInstanceOf(VerificationError)
  const message = (error as Error).message
  expect(message).not.toContain(SANDBOX_SECRET)
  expect(message).not.toContain(SANDBOX_SECRET.slice(0, 8))
})

it('rejects a replayed callback from a different order', async () => {
  const gateway = testGateway({
    fetch: stubRequest(() => ({ body: completedLookup() })).fetch,
  })
  const callback = successCallback({ purchase_order_id: 'ORD-OTHER' })
  const error = await captureError(() =>
    gateway.verify(callback, { expected: order({ id: 'ORD002' }) })
  )
  expect(error).toBeInstanceOf(VerificationError)
  expect((error as VerificationError).code).toBe('ORDER_MISMATCH')
})

it('declines to seal when the callback claims Completed but the lookup says Expired', async () => {
  const gateway = testGateway({
    fetch: stubRequest(() => ({
      status: 400,
      body: completedLookup({ status: 'Expired', transaction_id: null }),
    })).fetch,
  })
  const payment = await gateway.verify(
    successCallback({ status: 'Completed' }),
    { expected: order() }
  )
  expect(payment.status).toBe('expired')
  expect(payment.status).not.toBe('completed')
})

it('seals Completed when the lookup confirms it despite a canceled-looking callback', async () => {
  const gateway = testGateway({
    fetch: stubRequest(() => ({ body: completedLookup() })).fetch,
  })
  const payment = await gateway.verify(
    successCallback({ status: 'User canceled' }),
    { expected: order() }
  )
  expect(payment.status).toBe('completed')
})

it('rejects a callback whose amount was raised to match the order while the lookup is lower', async () => {
  const gateway = testGateway({
    fetch: stubRequest(() => ({
      body: completedLookup({ total_amount: 1000 }),
    })).fetch,
  })
  const error = await captureError(() =>
    gateway.verify(successCallback(), { expected: order() })
  )
  expect(error).toBeInstanceOf(VerificationError)
  expect((error as VerificationError).code).toBe('AMOUNT_MISMATCH')
})

it('produces a deterministic fingerprint for replay detection', async () => {
  const gateway = testGateway({
    fetch: stubRequest(() => ({ body: completedLookup() })).fetch,
  })
  const a = await gateway.verify(successCallback(), { expected: order() })
  const b = await gateway.verify(successCallback(), { expected: order() })
  expect(isVerifiedPayment(a)).toBe(true)
  expect(isVerifiedPayment(b)).toBe(true)
  expect(a.verifiedAt).toBeInstanceOf(Date)
  expect(b.verifiedAt).toBeInstanceOf(Date)

  const callback = successCallback()
  const fp1 = await callbackFingerprint(callback)
  const fp2 = await callbackFingerprint(callback)
  expect(fp1).toBe(fp2)
  const other = await callbackFingerprint(
    successCallback({ amount: '23001' }) as UnverifiedCallback
  )
  expect(other).not.toBe(fp1)
})

it('does not let a forged callback status bypass the lookup', async () => {
  const gateway = testGateway({
    fetch: stubRequest(() => ({
      status: 400,
      body: completedLookup({ status: 'User canceled', transaction_id: null }),
    })).fetch,
  })
  const payment = await gateway.verify(
    successCallback({ status: 'Completed' }),
    { expected: order() }
  )
  expect(payment.status).toBe('canceled')
})

it('handles a lookup body that is a bare array without crashing', async () => {
  const gateway = testGateway({
    fetch: stubRequest(() => ({ body: ['x'] })).fetch,
  })
  const error = await captureError(() =>
    gateway.verify(successCallback(), { expected: order() })
  )
  expect(error).toBeInstanceOf(VerificationError)
})

it('rejects a maliciously large total_amount as unsafe', async () => {
  const gateway = testGateway({
    fetch: stubRequest(() => ({
      body: completedLookup({ total_amount: Number.MAX_SAFE_INTEGER + 1 }),
    })).fetch,
  })
  const error = await captureError(() =>
    gateway.verify(successCallback(), { expected: order() })
  )
  expect(error).toBeInstanceOf(VerificationError)
})

it('rejects a lookup echoing a different pidx than requested', async () => {
  const gateway = testGateway({
    fetch: stubRequest(() => ({
      body: completedLookup({ pidx: 'SOMEONE-ELSE-PIDX' }),
    })).fetch,
  })
  const error = await captureError(() =>
    gateway.verify(successCallback(), { expected: order() })
  )
  expect(error).toBeInstanceOf(VerificationError)
  expect((error as VerificationError).code).toBe('UNKNOWN_TRANSACTION')
})

it('times out instead of hanging on a stalled lookup', async () => {
  const gateway = testGateway({
    fetch: (async (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'))
        })
      })) as unknown as typeof globalThis.fetch,
    timeoutMs: 25,
  })
  const error = await captureError(() =>
    gateway.verify(successCallback(), { expected: order() })
  )
  expect(error).toBeDefined()
  expect((error as Error).name).toBe('AbortError')
  expect(isVerifiedPayment(error)).toBe(false)
})

it('rejects a callback tagged for another gateway during status checks', async () => {
  const gateway = testGateway({
    fetch: stubRequest(() => ({ body: completedLookup() })).fetch,
  })
  const error = await captureError(() =>
    gateway.status({ id: COMPLETED_PIDX, gateway: 'connectips' })
  )
  expect(error).toBeInstanceOf(VerificationError)
  expect((error as VerificationError).code).toBe('GATEWAY_MISMATCH')
})
