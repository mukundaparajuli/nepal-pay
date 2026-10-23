import {
  VerificationError,
  moneyEquals,
  type Order,
  type TxnRef,
  type UnverifiedCallback,
  type VerifiedPayment,
} from '@nepal-pay/core'
import { createVerifiedPayment } from '@nepal-pay/core/internal'
import type {
  KhaltiCallbackPayload,
  KhaltiStatusOptions,
  ResolvedKhaltiConfig,
} from './types.js'
import { khaltiPaisaToMoney, mapKhaltiStatus, queryLookup } from './status.js'
import { PIDX_PATTERN } from './constants.js'

function assertKhaltiGateway(callback: UnverifiedCallback): void {
  if (callback.gateway !== 'khalti') {
    throw new VerificationError(
      `Unexpected gateway for Khalti verification: ${String(callback.gateway)}`,
      'GATEWAY_MISMATCH'
    )
  }
}

function callbackAmountMoney(
  payload: KhaltiCallbackPayload,
  field: string
): ReturnType<typeof khaltiPaisaToMoney> {
  const value = payload[field]
  if (typeof value !== 'string' || !/^-?\d+$/.test(value.trim())) {
    throw new VerificationError(
      `Khalti callback ${field} must be an integer amount in paisa`,
      'INVALID_AMOUNT'
    )
  }
  return khaltiPaisaToMoney(value)
}

export async function verifyKhaltiPayment(
  config: ResolvedKhaltiConfig,
  callback: UnverifiedCallback,
  expected: Order
): Promise<VerifiedPayment> {
  assertKhaltiGateway(callback)
  const payload = (callback.data ?? {}) as KhaltiCallbackPayload

  const pidx = payload.pidx
  if (typeof pidx !== 'string' || pidx.length === 0) {
    throw new VerificationError(
      'Khalti callback is missing a pidx',
      'MALFORMED_CALLBACK'
    )
  }
  if (!PIDX_PATTERN.test(pidx)) {
    throw new VerificationError(
      'Khalti callback pidx is malformed',
      'MALFORMED_CALLBACK'
    )
  }

  const purchaseOrderId = payload.purchase_order_id
  if (purchaseOrderId !== expected.id) {
    throw new VerificationError(
      'Khalti callback purchase_order_id does not match the expected order',
      'ORDER_MISMATCH'
    )
  }

  if (payload.amount !== undefined) {
    const callbackAmount = callbackAmountMoney(payload, 'amount')
    if (!moneyEquals(callbackAmount, expected.amount)) {
      throw new VerificationError(
        'Khalti callback amount does not match the expected order',
        'AMOUNT_MISMATCH'
      )
    }
  }
  if (payload.total_amount !== undefined) {
    const callbackTotal = callbackAmountMoney(payload, 'total_amount')
    if (!moneyEquals(callbackTotal, expected.amount)) {
      throw new VerificationError(
        'Khalti callback total_amount does not match the expected order',
        'AMOUNT_MISMATCH'
      )
    }
  }

  const lookup = await queryLookup(config, pidx)
  if (lookup.pidx !== pidx) {
    throw new VerificationError(
      'Khalti lookup returned a different pidx',
      'UNKNOWN_TRANSACTION'
    )
  }
  if (
    lookup.purchase_order_id !== undefined &&
    lookup.purchase_order_id !== expected.id
  ) {
    throw new VerificationError(
      'Khalti lookup purchase_order_id does not match the expected order',
      'ORDER_MISMATCH'
    )
  }
  const lookupAmount = khaltiPaisaToMoney(lookup.total_amount)
  if (!moneyEquals(lookupAmount, expected.amount)) {
    throw new VerificationError(
      'Khalti lookup total_amount does not match the expected order',
      'AMOUNT_MISMATCH'
    )
  }

  const status = mapKhaltiStatus(lookup.status)
  if (status === 'completed') {
    if (
      typeof lookup.transaction_id !== 'string' ||
      lookup.transaction_id.length === 0
    ) {
      throw new VerificationError(
        'Khalti completed transaction is missing transaction_id',
        'INVALID_TXN_REF'
      )
    }
  }

  return createVerifiedPayment({
    __unverified: true,
    orderId: expected.id,
    amount: expected.amount,
    status,
    txnRef: { id: pidx, gateway: 'khalti' },
    raw: {
      callback: { ...payload },
      lookup: { ...lookup },
    },
  })
}

export async function checkKhaltiStatus(
  config: ResolvedKhaltiConfig,
  txnRef: TxnRef,
  options?: KhaltiStatusOptions
): Promise<VerifiedPayment> {
  if (txnRef.gateway !== 'khalti') {
    throw new VerificationError(
      `Unexpected gateway for Khalti status: ${String(txnRef.gateway)}`,
      'GATEWAY_MISMATCH'
    )
  }
  const pidx = txnRef.id
  if (!PIDX_PATTERN.test(pidx)) {
    throw new VerificationError(
      'Khalti transaction id must be a valid pidx',
      'INVALID_TXN_REF'
    )
  }

  const expected = options?.expected
  const lookup = await queryLookup(config, pidx)
  if (expected !== undefined) {
    if (
      lookup.purchase_order_id !== undefined &&
      lookup.purchase_order_id !== expected.id
    ) {
      throw new VerificationError(
        'Khalti lookup purchase_order_id does not match the expected order',
        'ORDER_MISMATCH'
      )
    }
    if (
      !moneyEquals(khaltiPaisaToMoney(lookup.total_amount), expected.amount)
    ) {
      throw new VerificationError(
        'Khalti lookup total_amount does not match the expected order',
        'AMOUNT_MISMATCH'
      )
    }
  }

  const orderId =
    expected !== undefined ? expected.id : lookup.purchase_order_id
  if (orderId === undefined) {
    throw new VerificationError(
      'Khalti lookup did not return purchase_order_id; pass an expected order',
      'ORDER_MISMATCH'
    )
  }

  const amount =
    expected !== undefined
      ? expected.amount
      : khaltiPaisaToMoney(lookup.total_amount)
  if (amount.amount <= 0n) {
    throw new VerificationError(
      'Khalti lookup returned a non-positive amount; pass an expected order',
      'INVALID_AMOUNT'
    )
  }

  const status = mapKhaltiStatus(lookup.status)
  return createVerifiedPayment({
    __unverified: true,
    orderId,
    amount,
    status,
    txnRef: { id: pidx, gateway: 'khalti' },
    raw: { ...lookup },
  })
}
