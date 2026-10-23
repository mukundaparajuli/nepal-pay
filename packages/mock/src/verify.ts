import {
  moneyEquals,
  VerificationError,
  type Money,
  type Order,
  type TxnRef,
  type UnverifiedCallback,
  type VerifiedPayment,
} from '@nepal-pay/core'
import { createVerifiedPayment } from '@nepal-pay/core/internal'
import type {
  MockCallbackPayload,
  MockStatusOptions,
  ResolvedMockConfig,
} from './types.js'
import type { MockLedger } from './ledger.js'
import type { MockLedgerEntry } from './types.js'
import { mapMockStatus } from './status.js'
import { mockMoneyFromPaisa } from './config.js'
import { verifyMockSignature } from './signing.js'
import { TRANSACTION_ID_PATTERN } from './constants.js'

export function assertMockGateway(callback: UnverifiedCallback): void {
  if (callback.gateway !== 'mock') {
    throw new VerificationError(
      `Unexpected gateway for mock verification: ${String(callback.gateway)}`,
      'GATEWAY_MISMATCH'
    )
  }
}

function signedValues(payload: MockCallbackPayload): {
  readonly txn_id: string
  readonly order_id: string
  readonly amount: string
  readonly status: string
} {
  return {
    txn_id: String(payload.txn_id ?? ''),
    order_id: String(payload.order_id ?? ''),
    amount: String(payload.amount ?? ''),
    status: String(payload.status ?? ''),
  }
}

export async function lookupMockEntry(
  config: ResolvedMockConfig,
  ledger: MockLedger,
  txnId: string,
  signal: AbortSignal
): Promise<MockLedgerEntry> {
  if (config.scenario === 'timeout') {
    await new Promise<never>((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          const reason =
            signal.reason ??
            new DOMException('The operation was aborted', 'AbortError')
          reject(reason)
        },
        { once: true }
      )
    })
  }
  const entry = ledger.get(txnId)
  if (entry === undefined) {
    throw new VerificationError(
      `Mock gateway has no record for transaction ${txnId}`,
      'UNKNOWN_TRANSACTION'
    )
  }
  return entry
}

async function withMockTimeout<T>(
  config: ResolvedMockConfig,
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(
      new DOMException('The operation was aborted', 'AbortError')
    )
  }, config.timeoutMs)
  try {
    return await work(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

async function verifySignature(
  config: ResolvedMockConfig,
  payload: MockCallbackPayload
): Promise<boolean> {
  if (typeof payload.signature !== 'string' || payload.signature.length === 0) {
    return false
  }
  const values = signedValues(payload)
  if (
    values.txn_id.length === 0 ||
    values.order_id.length === 0 ||
    values.amount.length === 0 ||
    values.status.length === 0
  ) {
    return false
  }
  try {
    return await verifyMockSignature(
      values,
      config.secretKey,
      payload.signature
    )
  } catch {
    return false
  }
}

export async function verifyMockPayment(
  config: ResolvedMockConfig,
  ledger: MockLedger,
  callback: UnverifiedCallback,
  expected: Order
): Promise<VerifiedPayment> {
  assertMockGateway(callback)
  const payload = (callback.data ?? {}) as unknown as MockCallbackPayload

  if (!(await verifySignature(config, payload))) {
    throw new VerificationError(
      'Mock callback signature verification failed',
      'SIGNATURE_MISMATCH'
    )
  }

  const callbackAmount = mockMoneyFromPaisa(payload.amount)
  if (!moneyEquals(callbackAmount, expected.amount)) {
    throw new VerificationError(
      'Mock callback amount does not match the expected order',
      'AMOUNT_MISMATCH'
    )
  }
  if (String(payload.order_id ?? '') !== expected.id) {
    throw new VerificationError(
      'Mock callback order_id does not match the expected order',
      'ORDER_MISMATCH'
    )
  }

  const txnId = String(payload.txn_id ?? '')
  const entry = await withMockTimeout(config, (signal) =>
    lookupMockEntry(config, ledger, txnId, signal)
  )

  if (entry.orderId !== expected.id) {
    throw new VerificationError(
      'Mock ledger order does not match the expected order',
      'ORDER_MISMATCH'
    )
  }
  const ledgerAmount = mockMoneyFromPaisa(entry.amount)
  if (!moneyEquals(ledgerAmount, expected.amount)) {
    throw new VerificationError(
      'Mock ledger amount does not match the expected order',
      'AMOUNT_MISMATCH'
    )
  }

  const status = mapMockStatus(entry.status)
  if (status === 'completed' && !TRANSACTION_ID_PATTERN.test(txnId)) {
    throw new VerificationError(
      'Mock completed transaction has an invalid txn id',
      'INVALID_TXN_REF'
    )
  }

  return createVerifiedPayment({
    __unverified: true,
    orderId: expected.id,
    amount: expected.amount,
    status,
    txnRef: { id: txnId, gateway: 'mock' },
    raw: { callback: { ...payload }, ledger: { ...entry } },
  })
}

export async function checkMockStatus(
  config: ResolvedMockConfig,
  ledger: MockLedger,
  txnRef: TxnRef,
  options?: MockStatusOptions
): Promise<VerifiedPayment> {
  if (txnRef.gateway !== 'mock') {
    throw new VerificationError(
      `Unexpected gateway for mock status: ${String(txnRef.gateway)}`,
      'GATEWAY_MISMATCH'
    )
  }
  const txnId = txnRef.id
  if (!TRANSACTION_ID_PATTERN.test(txnId)) {
    throw new VerificationError(
      'Mock transaction id must be alphanumeric or hyphens',
      'INVALID_TXN_REF'
    )
  }

  const expected = options?.expected
  const entry = await withMockTimeout(config, (signal) =>
    lookupMockEntry(config, ledger, txnId, signal)
  )

  if (expected !== undefined) {
    if (entry.orderId !== expected.id) {
      throw new VerificationError(
        'Mock ledger order does not match the expected order',
        'ORDER_MISMATCH'
      )
    }
    if (!moneyEquals(mockMoneyFromPaisa(entry.amount), expected.amount)) {
      throw new VerificationError(
        'Mock ledger amount does not match the expected order',
        'AMOUNT_MISMATCH'
      )
    }
  }

  const amount: Money =
    expected !== undefined ? expected.amount : mockMoneyFromPaisa(entry.amount)
  if (amount.amount <= 0n) {
    throw new VerificationError(
      'Mock gateway returned a non-positive amount; pass an expected order',
      'INVALID_AMOUNT'
    )
  }

  const payment = createVerifiedPayment({
    __unverified: true,
    orderId: expected !== undefined ? expected.id : entry.orderId,
    amount,
    status: mapMockStatus(entry.status),
    txnRef: { id: txnId, gateway: 'mock' },
    raw: { ...entry },
  })
  return payment
}
