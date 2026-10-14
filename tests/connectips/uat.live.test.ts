import { readFileSync } from 'node:fs'
import { createPublicKey, verify as nodeVerify } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import {
  createOrder,
  moneyFromDecimal,
  importPkcs8PrivateKey,
} from '@nepal-payments/core'
import {
  buildCheckoutTokenMessage,
  createConnectIps,
  type ConnectIpsConfig,
  type ConnectIpsFormParams,
} from '@nepal-payments/connectips'
import { pfxToPkcs8Pem } from '@nepal-payments/connectips/pfx'

/**
 * Live UAT tests for connectIPS.
 *
 * These are skipped by default because they require real NCHL-provided UAT
 * credentials and a human completing the OTP flow in a browser. Enable with:
 *
 *   NPAY_CONNECTIPS_UAT=1 \
 *   NPAY_CONNECTIPS_MERCHANT_ID=... \
 *   NPAY_CONNECTIPS_APP_ID=... \
 *   NPAY_CONNECTIPS_APP_NAME=... \
 *   NPAY_CONNECTIPS_PASSWORD=... \
 *   NPAY_CONNECTIPS_PFX=/path/to/CREDITOR.pfx \
 *   NPAY_CONNECTIPS_PFX_PASSWORD=... \
 *   pnpm vitest run tests/connectips/uat.live.test.ts
 */

const enabled = process.env.NPAY_CONNECTIPS_UAT === '1'

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required when NPAY_CONNECTIPS_UAT=1`)
  }
  return value
}

function loadUatConfig(): {
  config: ConnectIpsConfig
  certificatePem?: string
} {
  const pfxPath = required('NPAY_CONNECTIPS_PFX')
  const pfxPassword = required('NPAY_CONNECTIPS_PFX_PASSWORD')
  const material = pfxToPkcs8Pem(
    new Uint8Array(readFileSync(pfxPath)),
    pfxPassword
  )
  return {
    certificatePem: material.certificatePem,
    config: {
      merchantId: required('NPAY_CONNECTIPS_MERCHANT_ID'),
      appId: required('NPAY_CONNECTIPS_APP_ID'),
      appName: required('NPAY_CONNECTIPS_APP_NAME'),
      password: required('NPAY_CONNECTIPS_PASSWORD'),
      privateKey: material.privateKeyPem,
      environment: 'sandbox',
    },
  }
}

describe.skipIf(!enabled)('connectIPS UAT (live)', () => {
  it('builds a signed checkout against the UAT login page', async () => {
    const { config, certificatePem } = loadUatConfig()
    const gateway = createConnectIps(config)
    const order = createOrder({
      id: `NPAY-UAT-${Date.now()}`.slice(0, 20),
      amount: moneyFromDecimal('10.00'),
      description: 'UAT smoke test',
    })

    const { checkout, txnRef } = await gateway.createCheckout(order)
    expect(checkout.type).toBe('form_post')
    expect(checkout.url).toBe(
      'https://uat.connectips.com/connectipswebgw/loginpage'
    )
    expect(txnRef.gateway).toBe('connectips')

    if (checkout.type !== 'form_post') return
    const params = checkout.formParams as ConnectIpsFormParams

    await expect(
      importPkcs8PrivateKey(config.privateKey)
    ).resolves.toBeDefined()

    if (certificatePem !== undefined) {
      const publicKey = createPublicKey(certificatePem)
      const ok = nodeVerify(
        'RSA-SHA256',
        Buffer.from(buildCheckoutTokenMessage(params), 'utf8'),
        publicKey,
        Buffer.from(params.TOKEN, 'base64')
      )
      expect(ok).toBe(true)
    }
  })

  it.todo(
    'completes a UAT payment then calls verify() with the redirected TXNID'
  )
})
