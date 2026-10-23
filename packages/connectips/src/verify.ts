import {
  moneyEquals,
  VerificationError,
  type Order,
  type RsaPrivateKey,
  type UnverifiedCallback,
  type VerifiedPayment,
} from '@nepal-pay/core'
import { createVerifiedPayment } from '@nepal-pay/core/internal'
import type {
  ConnectIpsCallbackPayload,
  ResolvedConnectIpsConfig,
} from './types.js'
import { connectIpsMoneyFromAmount, connectIpsPaisaFromMoney } from './money.js'
import {
  assertConnectIpsTxnId,
  assertResponseTxnId,
  mapConnectIpsStatus,
  queryValidation,
} from './status.js'

function assertConnectIpsGateway(callback: UnverifiedCallback): void {
  if (callback.gateway !== 'connectips') {
    throw new VerificationError(
      `Unexpected gateway for connectIPS verification: ${String(callback.gateway)}`,
      'GATEWAY_MISMATCH'
    )
  }
}

function readTxnId(callback: UnverifiedCallback): string {
  const payload = (callback.data ?? {}) as ConnectIpsCallbackPayload
  const raw = payload.TXNID
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new VerificationError(
      'connectIPS callback is missing TXNID',
      'MALFORMED_CALLBACK'
    )
  }
  return raw
}

/**
 * Verify a connectIPS payment.
 *
 * The callback is untrusted and carries only `TXNID`, so authenticity and
 * amount are established by calling the server-to-server `validatetxn` API
 * with the order amount. A completed upstream response also has its amount
 * re-checked against the expected order.
 */
export async function verifyConnectIpsPayment(
  config: ResolvedConnectIpsConfig,
  key: RsaPrivateKey,
  callback: UnverifiedCallback,
  expected: Order
): Promise<VerifiedPayment> {
  assertConnectIpsGateway(callback)
  const txnId = readTxnId(callback)
  assertConnectIpsTxnId(txnId)

  if (txnId !== expected.id) {
    throw new VerificationError(
      'connectIPS callback TXNID does not match the expected order',
      'ORDER_MISMATCH'
    )
  }

  const txnAmt = connectIpsPaisaFromMoney(expected.amount)
  const response = await queryValidation(config, key, txnId, txnAmt)
  assertResponseTxnId(response, txnId)

  const status = mapConnectIpsStatus(response.status)
  if (status === 'completed') {
    const amount = connectIpsMoneyFromAmount(response.txnAmt ?? txnAmt)
    if (!moneyEquals(amount, expected.amount)) {
      throw new VerificationError(
        'connectIPS validated amount does not match the expected order',
        'AMOUNT_MISMATCH'
      )
    }
  }

  return createVerifiedPayment({
    __unverified: true,
    orderId: expected.id,
    amount: expected.amount,
    status,
    txnRef: { id: txnId, gateway: 'connectips' },
    raw: { ...response },
  })
}
