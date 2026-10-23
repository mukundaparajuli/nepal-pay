import { VerificationError } from '@nepal-pay/core'
import { FONEPAY_MD } from './constants.js'
import type { ResolvedFonepayConfig } from './types.js'

/** Build the `verificationMerchant` URL for a transaction. */
export function verificationUrlFor(
  config: ResolvedFonepayConfig,
  prn: string,
  amount: string,
  bankCode?: string
): string {
  const params = new URLSearchParams({
    PID: config.merchantCode,
    PRN: prn,
    AMT: amount,
    MD: FONEPAY_MD,
  })
  if (bankCode !== undefined && bankCode.length > 0) {
    params.set('BID', bankCode)
  }
  return `${config.verificationUrl}?${params.toString()}`
}

/**
 * GET a plain-text response from a Fonepay server-to-server endpoint.
 *
 * `verificationMerchant` replies with `success` (or a failure/error string), so
 * the body is read as text. Transport failures raise `INVALID_STATUS`; aborts
 * propagate unchanged so callers can detect timeouts.
 */
export async function getFonepayText(
  config: ResolvedFonepayConfig,
  url: string
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  let response: Response
  try {
    response = await config.fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { accept: 'text/plain' },
    })
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    throw new VerificationError(
      `Fonepay verification failed with HTTP ${response.status}`,
      'INVALID_STATUS'
    )
  }

  try {
    return await response.text()
  } catch {
    throw new VerificationError(
      'Fonepay verification returned no readable body',
      'INVALID_STATUS'
    )
  }
}
