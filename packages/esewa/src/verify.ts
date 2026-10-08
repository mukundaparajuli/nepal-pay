import {
  moneyEquals,
  moneyToDecimal,
  VerificationError,
  type Order,
  type TxnRef,
  type UnverifiedCallback,
  type VerifiedPayment,
} from '@nepal-payments/core'
import { createVerifiedPayment } from '@nepal-payments/core/internal'
import type {
  EsewaCallbackPayload,
  EsewaStatusOptions,
  ResolvedEsewaConfig,
} from './types.js'
import { decodeRawJsonTokens, verifySignedFields } from './signing.js'
import { esewaMoneyFromAmount, mapEsewaStatus, queryStatus } from './status.js'
import { TRANSACTION_UUID_PATTERN } from './constants.js'

function signedValueTokens(
  payload: EsewaCallbackPayload,
  decodedText: string | undefined
): Record<string, string> {
  const tokens =
    typeof decodedText === 'string' ? decodeRawJsonTokens(decodedText) : {}
  for (const name of Object.keys(payload)) {
    if (tokens[name] === undefined && payload[name] !== undefined) {
      tokens[name] = String(payload[name])
    }
  }
  return tokens
}

function assertEsewaGateway(callback: UnverifiedCallback): void {
  if (callback.gateway !== 'esewa') {
    throw new VerificationError(
      `Unexpected gateway for eSewa verification: ${String(callback.gateway)}`,
      'GATEWAY_MISMATCH'
    )
  }
}

export async function verifyEsewaPayment(
  config: ResolvedEsewaConfig,
  callback: UnverifiedCallback,
  expected: Order
): Promise<VerifiedPayment> {
  assertEsewaGateway(callback)
  const payload = (callback.data ?? {}) as EsewaCallbackPayload
  const decodedText =
    typeof callback.body === 'string' ? callback.body : undefined

  if (typeof payload.signature !== 'string' || payload.signature.length === 0) {
    throw new VerificationError(
      'eSewa callback is missing a signature',
      'SIGNATURE_MISMATCH'
    )
  }
  const signedFieldNames = String(payload.signed_field_names ?? '')
  if (signedFieldNames.trim().length === 0) {
    throw new VerificationError(
      'eSewa callback is missing signed_field_names',
      'SIGNATURE_MISMATCH'
    )
  }
  const values = signedValueTokens(payload, decodedText)
  let signatureValid = false
  try {
    signatureValid = await verifySignedFields(
      values,
      signedFieldNames,
      config.secret,
      payload.signature
    )
  } catch {
    signatureValid = false
  }
  if (!signatureValid) {
    throw new VerificationError(
      'eSewa callback signature verification failed',
      'SIGNATURE_MISMATCH'
    )
  }

  const callbackAmount = esewaMoneyFromAmount(payload.total_amount)
  if (!moneyEquals(callbackAmount, expected.amount)) {
    throw new VerificationError(
      'eSewa callback amount does not match the expected order',
      'AMOUNT_MISMATCH'
    )
  }
  if (String(payload.transaction_uuid ?? '') !== expected.id) {
    throw new VerificationError(
      'eSewa callback transaction_uuid does not match the expected order',
      'ORDER_MISMATCH'
    )
  }
  if (String(payload.product_code ?? '') !== config.merchantCode) {
    throw new VerificationError(
      'eSewa callback product_code does not match the merchant code',
      'ORDER_MISMATCH'
    )
  }

  const rawStatus = String(payload.status ?? '')
  let status: 'completed' | ReturnType<typeof mapEsewaStatus>
  let txnRefId: string

  if (rawStatus === 'COMPLETE') {
    const txnCode = payload.transaction_code
    if (typeof txnCode !== 'string' || txnCode.length === 0) {
      throw new VerificationError(
        'eSewa COMPLETE callback is missing transaction_code',
        'INVALID_TXN_REF'
      )
    }
    const token = values['total_amount']
    const totalParam =
      token !== undefined && token !== ''
        ? token
        : moneyToDecimal(callbackAmount)
    const current = await queryStatus(
      config,
      String(payload.product_code),
      totalParam,
      String(payload.transaction_uuid)
    )
    if (current.status !== 'COMPLETE') {
      if (current.status === 'NOT_FOUND') {
        throw new VerificationError(
          'eSewa reports the transaction as NOT_FOUND',
          'UNKNOWN_TRANSACTION'
        )
      }
      throw new VerificationError(
        `eSewa status check disagrees with the callback: ${current.status}`,
        'INVALID_STATUS'
      )
    }
    if (current.product_code !== String(payload.product_code)) {
      throw new VerificationError(
        'eSewa status product_code mismatch',
        'ORDER_MISMATCH'
      )
    }
    if (current.transaction_uuid !== String(payload.transaction_uuid)) {
      throw new VerificationError(
        'eSewa status transaction_uuid mismatch',
        'ORDER_MISMATCH'
      )
    }
    if (
      !moneyEquals(esewaMoneyFromAmount(current.total_amount), expected.amount)
    ) {
      throw new VerificationError(
        'eSewa status amount mismatch',
        'AMOUNT_MISMATCH'
      )
    }
    if (current.ref_id !== txnCode) {
      throw new VerificationError(
        'eSewa status ref_id does not match transaction_code',
        'UNKNOWN_TRANSACTION'
      )
    }
    status = 'completed'
    txnRefId = txnCode
  } else {
    status = mapEsewaStatus(rawStatus)
    txnRefId =
      payload.transaction_code !== undefined
        ? String(payload.transaction_code)
        : String(payload.transaction_uuid ?? '')
  }

  return createVerifiedPayment({
    __unverified: true,
    orderId: expected.id,
    amount: expected.amount,
    status,
    txnRef: { id: txnRefId, gateway: 'esewa' },
    raw: { ...payload },
  })
}

export async function checkEsewaStatus(
  config: ResolvedEsewaConfig,
  txnRef: TxnRef,
  options?: EsewaStatusOptions
): Promise<VerifiedPayment> {
  if (txnRef.gateway !== 'esewa') {
    throw new VerificationError(
      `Unexpected gateway for eSewa status: ${String(txnRef.gateway)}`,
      'GATEWAY_MISMATCH'
    )
  }
  const uuid = txnRef.id
  if (!TRANSACTION_UUID_PATTERN.test(uuid)) {
    throw new VerificationError(
      'eSewa transaction id must be alphanumeric or hyphens',
      'INVALID_TXN_REF'
    )
  }

  const expected = options?.expected
  const orderId = expected !== undefined ? expected.id : uuid
  const totalParam =
    expected !== undefined ? moneyToDecimal(expected.amount) : '0'
  const current = await queryStatus(
    config,
    config.merchantCode,
    totalParam,
    uuid
  )

  if (expected !== undefined) {
    if (current.transaction_uuid !== uuid) {
      throw new VerificationError(
        'eSewa status transaction_uuid mismatch',
        'ORDER_MISMATCH'
      )
    }
    if (current.product_code !== config.merchantCode) {
      throw new VerificationError(
        'eSewa status product_code mismatch',
        'ORDER_MISMATCH'
      )
    }
    if (
      !moneyEquals(esewaMoneyFromAmount(current.total_amount), expected.amount)
    ) {
      throw new VerificationError(
        'eSewa status amount mismatch',
        'AMOUNT_MISMATCH'
      )
    }
  }

  const amount =
    expected !== undefined
      ? expected.amount
      : esewaMoneyFromAmount(current.total_amount)
  if (amount.amount <= 0n) {
    throw new VerificationError(
      'eSewa status returned a non-positive amount; pass an expected order',
      'INVALID_AMOUNT'
    )
  }

  const paymentStatus = mapEsewaStatus(current.status)
  const refId = current.ref_id
  const txnRefId =
    paymentStatus === 'completed' && refId !== null ? refId : uuid

  return createVerifiedPayment({
    __unverified: true,
    orderId,
    amount,
    status: paymentStatus,
    txnRef: { id: txnRefId, gateway: 'esewa' },
    raw: { ...current },
  })
}
