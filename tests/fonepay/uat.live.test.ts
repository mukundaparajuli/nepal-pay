import { describe, it, expect } from 'vitest'
import {
  buildRequestMessage,
  createFonepay,
  verifyFonepayDv,
  type FonepayConfig,
} from '@nepal-pay/fonepay'
import { order } from './helpers.js'

/**
 * Live UAT tests against Fonepay's sandbox.
 *
 * These are skipped unless real partner credentials are supplied. Run with:
 *
 *   NPAY_FONEPAY_UAT=1 \
 *   NPAY_FONEPAY_MERCHANT_CODE=<PID> \
 *   NPAY_FONEPAY_SECRET=<secret> \
 *   pnpm vitest run tests/fonepay/uat.live.test.ts
 */
const enabled = process.env.NPAY_FONEPAY_UAT === '1'
const merchantCode = process.env.NPAY_FONEPAY_MERCHANT_CODE ?? ''
const secretKey = process.env.NPAY_FONEPAY_SECRET ?? ''

function liveConfig(): FonepayConfig {
  return {
    merchantCode,
    secretKey,
    environment: 'sandbox',
    returnUrl:
      process.env.NPAY_FONEPAY_RETURN_URL ??
      'https://example.com/fonepay/callback',
  }
}

describe.skipIf(!enabled)('fonepay UAT (live)', () => {
  it('builds a checkout URL with a locally verifiable DV', async () => {
    const gateway = createFonepay(liveConfig())
    const result = await gateway.createCheckout(
      order({
        id: `UAT-${Date.now()}`,
        returnUrl: 'https://example.com/fonepay/callback',
      })
    )
    expect(result.checkout.type).toBe('redirect')
    const params = new URL(result.checkout.url).searchParams
    const values = {
      PID: params.get('PID') ?? '',
      MD: params.get('MD') ?? '',
      PRN: params.get('PRN') ?? '',
      AMT: params.get('AMT') ?? '',
      CRN: params.get('CRN') ?? '',
      DT: params.get('DT') ?? '',
      R1: params.get('R1') ?? '',
      R2: params.get('R2') ?? '',
      RU: params.get('RU') ?? '',
    }
    expect(
      await verifyFonepayDv(
        buildRequestMessage(values),
        secretKey,
        params.get('DV') ?? ''
      )
    ).toBe(true)
  })

  it('queries verificationMerchant for a completed transaction', async () => {
    const prn = process.env.NPAY_FONEPAY_PRN
    if (prn === undefined) {
      // No completed transaction reference supplied; nothing to reconcile.
      return
    }
    const gateway = createFonepay(liveConfig())
    const payment = await gateway.status(
      { id: prn, gateway: 'fonepay' },
      { expected: order({ id: prn }) }
    )
    expect(['completed', 'failed', 'unknown']).toContain(payment.status)
  })
})
