import { describe, it, expect, vi } from 'vitest'
import {
  PaymentError,
  TERMINAL_PAYMENT_STATUSES,
  createOrder,
  isTerminalPaymentStatus,
  isVerifiedPayment,
  moneyFromDecimal,
  reconcile,
  type GatewayAdapter,
  type PaymentStatus,
  type PendingPayment,
  type VerifiedPayment,
} from '@nepal-payments/core'
import { createVerifiedPayment } from '@nepal-payments/core/internal'

const ORDER = createOrder({
  id: 'ORD-RECON-1',
  amount: moneyFromDecimal('100.00'),
})

const PENDING: PendingPayment = {
  order: ORDER,
  txnRef: { id: 'txn-recon-1', gateway: 'mock' },
}

function verified(status: PaymentStatus): VerifiedPayment {
  return createVerifiedPayment({
    __unverified: true,
    orderId: ORDER.id,
    amount: ORDER.amount,
    status,
    txnRef: PENDING.txnRef,
  })
}

type Step = PaymentStatus | Error

function stubGateway(steps: readonly Step[]) {
  let index = 0
  const status = vi.fn(async (): Promise<VerifiedPayment> => {
    const step = steps[Math.min(index, steps.length - 1)]
    index += 1
    if (step instanceof Error) throw step
    return verified(step as PaymentStatus)
  })
  const gateway = {
    name: 'mock',
    createCheckout: vi.fn(),
    parseCallback: vi.fn(),
    verify: vi.fn(),
    status,
  } as unknown as GatewayAdapter
  return { gateway, status }
}

const noSleep = async (): Promise<void> => undefined

describe('terminal payment statuses', () => {
  it('lists the statuses that end a lifecycle', () => {
    expect(TERMINAL_PAYMENT_STATUSES).toEqual([
      'completed',
      'failed',
      'canceled',
      'expired',
    ])
  })

  it('guards terminal statuses', () => {
    expect(isTerminalPaymentStatus('completed')).toBe(true)
    expect(isTerminalPaymentStatus('failed')).toBe(true)
    expect(isTerminalPaymentStatus('pending')).toBe(false)
    expect(isTerminalPaymentStatus('unknown')).toBe(false)
    expect(isTerminalPaymentStatus(42)).toBe(false)
  })
})

describe('reconcile', () => {
  it('returns immediately on a terminal status', async () => {
    const { gateway, status } = stubGateway(['completed'])
    const result = await reconcile(gateway, PENDING, { sleep: noSleep })
    expect(result.resolved).toBe(true)
    expect(result.reason).toBe('terminal')
    expect(result.status).toBe('completed')
    expect(result.attempts).toBe(1)
    expect(isVerifiedPayment(result.payment)).toBe(true)
    expect(status).toHaveBeenCalledTimes(1)
  })

  it('treats failed/canceled/expired as terminal', async () => {
    for (const terminal of ['failed', 'canceled', 'expired'] as const) {
      const { gateway } = stubGateway([terminal])
      const result = await reconcile(gateway, PENDING, { sleep: noSleep })
      expect(result.resolved).toBe(true)
      expect(result.status).toBe(terminal)
    }
  })

  it('retries via status() and applies exponential backoff', async () => {
    const delays: number[] = []
    const { gateway, status } = stubGateway(['pending', 'pending', 'completed'])
    const result = await reconcile(gateway, PENDING, {
      maxAttempts: 5,
      backoffMs: 100,
      sleep: async (ms) => {
        delays.push(ms)
      },
    })
    expect(result.status).toBe('completed')
    expect(result.resolved).toBe(true)
    expect(result.attempts).toBe(3)
    expect(status).toHaveBeenCalledTimes(3)
    expect(delays).toEqual([100, 200])
  })

  it('caps backoff at maxBackoffMs', async () => {
    const delays: number[] = []
    const { gateway } = stubGateway(['pending'])
    await reconcile(gateway, PENDING, {
      maxAttempts: 4,
      backoffMs: 100,
      maxBackoffMs: 250,
      sleep: async (ms) => {
        delays.push(ms)
      },
    })
    expect(delays).toEqual([100, 200, 250])
  })

  it('stops when attempts are exhausted while still pending', async () => {
    const { gateway, status } = stubGateway(['pending'])
    const result = await reconcile(gateway, PENDING, {
      maxAttempts: 2,
      sleep: noSleep,
    })
    expect(result.resolved).toBe(false)
    expect(result.reason).toBe('exhausted')
    expect(result.status).toBe('pending')
    expect(result.attempts).toBe(2)
    expect(status).toHaveBeenCalledTimes(2)
  })

  it('returns UNKNOWN when the gateway keeps reporting unknown', async () => {
    const { gateway } = stubGateway(['unknown'])
    const result = await reconcile(gateway, PENDING, {
      maxAttempts: 2,
      sleep: noSleep,
    })
    expect(result.resolved).toBe(false)
    expect(result.reason).toBe('exhausted')
    expect(result.status).toBe('unknown')
  })

  it('gives up when the time budget is exhausted', async () => {
    let clock = 0
    const { gateway } = stubGateway(['pending'])
    const result = await reconcile(gateway, PENDING, {
      maxAttempts: 100,
      backoffMs: 300,
      timeoutMs: 1_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
    })
    expect(result.resolved).toBe(false)
    expect(result.reason).toBe('timeout')
    expect(result.status).toBe('pending')
  })

  it('gives up at the expiry deadline', async () => {
    let clock = 0
    const { gateway } = stubGateway(['pending'])
    const result = await reconcile(gateway, PENDING, {
      maxAttempts: 100,
      backoffMs: 300,
      timeoutMs: 1_000_000,
      expiresAt: new Date(500),
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
    })
    expect(result.resolved).toBe(false)
    expect(result.reason).toBe('expired')
    expect(result.status).toBe('pending')
  })

  it('retries transient lookup errors', async () => {
    const { gateway, status } = stubGateway([new Error('network'), 'completed'])
    const result = await reconcile(gateway, PENDING, {
      maxAttempts: 3,
      sleep: noSleep,
    })
    expect(result.status).toBe('completed')
    expect(result.attempts).toBe(2)
    expect(status).toHaveBeenCalledTimes(2)
  })

  it('rethrows the last error when every attempt fails', async () => {
    const forgotten = new Error('still down')
    const { gateway } = stubGateway([forgotten])
    await expect(
      reconcile(gateway, PENDING, { maxAttempts: 2, sleep: noSleep })
    ).rejects.toThrow('still down')
  })

  it('can surface the first error without retrying', async () => {
    const { gateway, status } = stubGateway([new Error('boom'), 'completed'])
    await expect(
      reconcile(gateway, PENDING, {
        maxAttempts: 5,
        retryOnError: false,
        sleep: noSleep,
      })
    ).rejects.toThrow('boom')
    expect(status).toHaveBeenCalledTimes(1)
  })

  it('returns the last known payment if a later attempt errors', async () => {
    const { gateway } = stubGateway(['pending', new Error('flaky')])
    const result = await reconcile(gateway, PENDING, {
      maxAttempts: 2,
      sleep: noSleep,
    })
    expect(result.resolved).toBe(false)
    expect(result.status).toBe('pending')
    expect(result.reason).toBe('exhausted')
  })

  it('passes the expected order into status()', async () => {
    const { gateway, status } = stubGateway(['completed'])
    await reconcile(gateway, PENDING, { sleep: noSleep })
    expect(status).toHaveBeenCalledWith(PENDING.txnRef, { expected: ORDER })
  })

  it('rejects invalid options', async () => {
    const { gateway } = stubGateway(['completed'])
    const attempts = [
      { maxAttempts: 0 },
      { maxAttempts: 1.5 },
      { backoffMs: -1 },
      { timeoutMs: -1 },
      { expiresAt: new Date('nope') },
    ]
    for (const options of attempts) {
      await expect(reconcile(gateway, PENDING, options)).rejects.toMatchObject({
        code: 'INVALID_RECONCILE_OPTIONS',
      })
    }
    await expect(
      reconcile(gateway, PENDING, { maxAttempts: 0 })
    ).rejects.toBeInstanceOf(PaymentError)
  })
})
