import {
  VerificationError,
  type PaymentStatus,
  type TxnRef,
  type VerifiedPayment,
} from '@nepal-pay/core'
import { createVerifiedPayment } from '@nepal-pay/core/internal'
import type { FonepayStatusOptions, ResolvedFonepayConfig } from './types.js'
import { fonepayAmountFromMoney } from './money.js'
import { isValidPrn } from './validation.js'
import { getFonepayText, verificationUrlFor } from './api.js'

/**
 * Map the `verificationMerchant` plain-text response to a unified status.
 *
 * Fonepay replies with `success` on a settled payment; any other body is
 * treated as failed (contains `fail`) or unknown.
 */
export function mapFonepayVerification(response: unknown): PaymentStatus {
  if (typeof response !== 'string') return 'unknown'
  const text = response.trim().toLowerCase()
  if (text.length === 0) return 'unknown'
  if (text.includes('success')) return 'completed'
  if (text.includes('fail')) return 'failed'
  return 'unknown'
}

/**
 * Map a callback's response code and status flag to a unified status.
 *
 * - `RC=successful` → completed (unless `PS=false`).
 * - `RC=failed` → failed; `RC=cancel` → canceled.
 * - Falls back to `PS=true` → completed / `PS=false` → failed.
 */
export function mapFonepayResponseCode(
  rc: unknown,
  ps: unknown
): PaymentStatus {
  const code = typeof rc === 'string' ? rc.trim().toLowerCase() : ''
  const flag = typeof ps === 'string' ? ps.trim().toLowerCase() : ''
  if (code === 'successful') return flag === 'false' ? 'failed' : 'completed'
  if (code === 'failed') return 'failed'
  if (code === 'cancel') return 'canceled'
  if (flag === 'true') return 'completed'
  if (flag === 'false') return 'failed'
  return 'unknown'
}

export function assertFonepayPrn(prn: string): void {
  if (!isValidPrn(prn)) {
    throw new VerificationError(
      'Fonepay PRN must be 3-25 characters without spaces or commas',
      'INVALID_TXN_REF'
    )
  }
}

/** Query the `verificationMerchant` API for a transaction. */
export function queryVerification(
  config: ResolvedFonepayConfig,
  prn: string,
  amount: string,
  bankCode?: string
): Promise<string> {
  return getFonepayText(
    config,
    verificationUrlFor(config, prn, amount, bankCode)
  )
}

/**
 * Reconcile a Fonepay transaction via `verificationMerchant`.
 *
 * Fonepay's lookup requires the amount, so an expected order must be supplied;
 * unlike connectIPS it cannot recover an amount from a bare reference.
 */
export async function checkFonepayStatus(
  config: ResolvedFonepayConfig,
  txnRef: TxnRef,
  options?: FonepayStatusOptions
): Promise<VerifiedPayment> {
  if (txnRef.gateway !== 'fonepay') {
    throw new VerificationError(
      `Unexpected gateway for Fonepay status: ${String(txnRef.gateway)}`,
      'GATEWAY_MISMATCH'
    )
  }
  assertFonepayPrn(txnRef.id)

  const expected = options?.expected
  if (expected === undefined) {
    throw new VerificationError(
      'Fonepay status requires an expected order to supply the amount',
      'INVALID_AMOUNT'
    )
  }

  const amount = fonepayAmountFromMoney(expected.amount)
  const response = await queryVerification(
    config,
    txnRef.id,
    amount,
    options?.bankCode
  )

  return createVerifiedPayment({
    __unverified: true,
    orderId: expected.id,
    amount: expected.amount,
    status: mapFonepayVerification(response),
    txnRef: { id: txnRef.id, gateway: 'fonepay' },
    raw: { response },
  })
}
