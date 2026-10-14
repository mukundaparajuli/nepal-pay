import {
  VerificationError,
  type PaymentStatus,
  type RsaPrivateKey,
  type TxnRef,
  type VerifiedPayment,
} from '@nepal-payments/core'
import { createVerifiedPayment } from '@nepal-payments/core/internal'
import type {
  ConnectIpsApiResponse,
  ConnectIpsStatusOptions,
  ResolvedConnectIpsConfig,
} from './types.js'
import { SUCCESS_CREDIT_STATUSES } from './constants.js'
import { connectIpsMoneyFromAmount, connectIpsPaisaFromMoney } from './money.js'
import { buildValidationTokenMessage, signConnectIpsToken } from './signing.js'
import { isValidTxnId } from './validation.js'
import { postConnectIpsJson } from './api.js'

/**
 * Map a connectIPS response to a unified status.
 *
 * - `SUCCESS` (optionally gated by a `creditStatus`) → completed / failed.
 * - `FAILED` → failed.
 * - `ERROR` (not found / incomplete) and anything unknown → unknown.
 */
export function mapConnectIpsStatus(
  status: unknown,
  creditStatus?: unknown
): PaymentStatus {
  if (typeof status !== 'string') return 'unknown'
  const normalized = status.trim().toUpperCase()
  if (normalized === 'SUCCESS') {
    if (typeof creditStatus === 'string' && creditStatus.trim() !== '') {
      return (SUCCESS_CREDIT_STATUSES as readonly string[]).includes(
        creditStatus.trim().toUpperCase()
      )
        ? 'completed'
        : 'failed'
    }
    return 'completed'
  }
  if (normalized === 'FAILED') return 'failed'
  return 'unknown'
}

async function query(
  config: ResolvedConnectIpsConfig,
  key: RsaPrivateKey,
  url: string,
  txnId: string,
  txnAmt: string
): Promise<ConnectIpsApiResponse> {
  const token = await signConnectIpsToken(
    buildValidationTokenMessage({
      merchantId: config.merchantId,
      appId: config.appId,
      referenceId: txnId,
      txnAmt,
    }),
    key
  )
  return postConnectIpsJson(config, url, {
    merchantId: config.merchantId,
    appId: config.appId,
    referenceId: txnId,
    txnAmt,
    token,
  })
}

/**
 * Guard against a response that is not for the requested transaction. NCHL
 * omits `referenceId` for unknown transactions, which we allow when the
 * status is not a success.
 */
export function assertResponseTxnId(
  response: ConnectIpsApiResponse,
  txnId: string
): void {
  const referenceId = response.referenceId
  if (typeof referenceId === 'string' && referenceId.length > 0) {
    if (referenceId !== txnId) {
      throw new VerificationError(
        `connectIPS response referenceId mismatch: ${referenceId}`,
        'UNKNOWN_TRANSACTION'
      )
    }
    return
  }
  if (mapConnectIpsStatus(response.status) === 'completed') {
    throw new VerificationError(
      'connectIPS response is missing a referenceId',
      'UNKNOWN_TRANSACTION'
    )
  }
}

export function assertConnectIpsTxnId(txnId: string): void {
  if (!isValidTxnId(txnId)) {
    throw new VerificationError(
      'connectIPS transaction id must be 1-20 characters of A-Z, a-z, 0-9, "_" or "-"',
      'INVALID_TXN_REF'
    )
  }
}

export async function queryValidation(
  config: ResolvedConnectIpsConfig,
  key: RsaPrivateKey,
  txnId: string,
  txnAmt: string
): Promise<ConnectIpsApiResponse> {
  return query(config, key, config.validationUrl, txnId, txnAmt)
}

export async function queryTxnDetail(
  config: ResolvedConnectIpsConfig,
  key: RsaPrivateKey,
  txnId: string,
  txnAmt: string
): Promise<ConnectIpsApiResponse> {
  return query(config, key, config.txnDetailUrl, txnId, txnAmt)
}

export async function checkConnectIpsStatus(
  config: ResolvedConnectIpsConfig,
  key: RsaPrivateKey,
  txnRef: TxnRef,
  options?: ConnectIpsStatusOptions
): Promise<VerifiedPayment> {
  if (txnRef.gateway !== 'connectips') {
    throw new VerificationError(
      `Unexpected gateway for connectIPS status: ${String(txnRef.gateway)}`,
      'GATEWAY_MISMATCH'
    )
  }
  const txnId = txnRef.id
  assertConnectIpsTxnId(txnId)

  const expected = options?.expected
  const requestAmt =
    expected !== undefined ? connectIpsPaisaFromMoney(expected.amount) : '0'
  const response = await queryTxnDetail(config, key, txnId, requestAmt)
  assertResponseTxnId(response, txnId)

  const status = mapConnectIpsStatus(response.status, response.creditStatus)
  const amount =
    expected !== undefined
      ? expected.amount
      : connectIpsMoneyFromAmount(response.txnAmt)
  if (amount.amount <= 0n) {
    throw new VerificationError(
      'connectIPS status returned a non-positive amount; pass an expected order',
      'INVALID_AMOUNT'
    )
  }
  const orderId = expected !== undefined ? expected.id : txnId

  return createVerifiedPayment({
    __unverified: true,
    orderId,
    amount,
    status,
    txnRef: { id: txnId, gateway: 'connectips' },
    raw: { ...response },
  })
}
