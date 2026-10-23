import {
  moneyEquals,
  VerificationError,
  type Order,
  type UnverifiedCallback,
  type VerifiedPayment,
} from '@nepal-pay/core'
import { createVerifiedPayment } from '@nepal-pay/core/internal'
import type { FonepayCallbackPayload, ResolvedFonepayConfig } from './types.js'
import { fonepayAmountFromMoney, fonepayMoneyFromAmount } from './money.js'
import { buildResponseMessage, verifyFonepayDv } from './signing.js'
import {
  assertFonepayPrn,
  mapFonepayResponseCode,
  mapFonepayVerification,
  queryVerification,
} from './status.js'

function assertFonepayGateway(callback: UnverifiedCallback): void {
  if (callback.gateway !== 'fonepay') {
    throw new VerificationError(
      `Unexpected gateway for Fonepay verification: ${String(callback.gateway)}`,
      'GATEWAY_MISMATCH'
    )
  }
}

/**
 * Verify a Fonepay payment.
 *
 * The callback is untrusted. Authenticity is established by recomputing the
 * HMAC-SHA512 DV over the response fields with the shared secret; the order id
 * and amount are then checked against the expected order. When enabled, a
 * completed callback is additionally confirmed against `verificationMerchant`,
 * and a disagreement downgrades the sealed status.
 */
export async function verifyFonepayPayment(
  config: ResolvedFonepayConfig,
  callback: UnverifiedCallback,
  expected: Order
): Promise<VerifiedPayment> {
  assertFonepayGateway(callback)
  const payload = (callback.data ?? {}) as FonepayCallbackPayload

  const prn = payload.PRN
  if (typeof prn !== 'string' || prn.length === 0) {
    throw new VerificationError(
      'Fonepay callback is missing PRN',
      'MALFORMED_CALLBACK'
    )
  }
  assertFonepayPrn(prn)

  const dv = payload.DV
  if (typeof dv !== 'string' || dv.length === 0) {
    throw new VerificationError(
      'Fonepay callback is missing DV',
      'MALFORMED_CALLBACK'
    )
  }
  const valid = await verifyFonepayDv(
    buildResponseMessage(payload),
    config.secretKey,
    dv
  )
  if (!valid) {
    throw new VerificationError(
      'Fonepay callback DV is invalid',
      'SIGNATURE_MISMATCH'
    )
  }

  if (payload.PID !== config.merchantCode) {
    throw new VerificationError(
      'Fonepay callback PID does not match the configured merchant code',
      'ORDER_MISMATCH'
    )
  }
  if (prn !== expected.id) {
    throw new VerificationError(
      'Fonepay callback PRN does not match the expected order',
      'ORDER_MISMATCH'
    )
  }

  let status = mapFonepayResponseCode(payload.RC, payload.PS)
  if (status === 'completed') {
    const amount = fonepayMoneyFromAmount(payload.P_AMT ?? payload.R_AMT)
    if (!moneyEquals(amount, expected.amount)) {
      throw new VerificationError(
        'Fonepay callback amount does not match the expected order',
        'AMOUNT_MISMATCH'
      )
    }
  }

  if (status === 'completed' && config.serverVerification) {
    const bankCode = typeof payload.BC === 'string' ? payload.BC : undefined
    const response = await queryVerification(
      config,
      prn,
      fonepayAmountFromMoney(expected.amount),
      bankCode
    )
    const upstream = mapFonepayVerification(response)
    if (upstream !== 'completed') {
      status = upstream
    }
  }

  return createVerifiedPayment({
    __unverified: true,
    orderId: expected.id,
    amount: expected.amount,
    status,
    txnRef: { id: prn, gateway: 'fonepay' },
    raw: { ...payload },
  })
}
