import { describe, it, expect } from 'vitest'
import { createPublicKey, verify as nodeVerify } from 'node:crypto'
import {
  importPkcs8PrivateKey,
  rsaSha256Sign,
  PaymentError,
} from '@nepal-pay/core'
import { pfxToPkcs8Pem } from '@nepal-pay/connectips/pfx'
import { TEST_PFX_PASSWORD, loadTestPfx } from './helpers.js'

describe('pfxToPkcs8Pem', () => {
  it('converts a PKCS#12 archive to a usable PKCS#8 key and certificate', async () => {
    const { pfx, certificatePem } = loadTestPfx()
    const material = pfxToPkcs8Pem(pfx, TEST_PFX_PASSWORD)

    expect(material.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----')
    expect(material.privateKeyPem).toContain('-----END PRIVATE KEY-----')
    expect(material.certificatePem).toContain('-----BEGIN CERTIFICATE-----')
    expect(material.certificateChainPem).toContain(
      '-----BEGIN CERTIFICATE-----'
    )

    const key = await importPkcs8PrivateKey(material.privateKeyPem)
    const signature = await rsaSha256Sign('connectips-token', key)
    const publicKey = createPublicKey(certificatePem)
    const ok = nodeVerify(
      'RSA-SHA256',
      Buffer.from('connectips-token', 'utf8'),
      publicKey,
      Buffer.from(signature, 'base64')
    )
    expect(ok).toBe(true)
  })

  it('rejects a wrong password', () => {
    const { pfx } = loadTestPfx()
    expect(() => pfxToPkcs8Pem(pfx, 'not-the-password')).toThrow(PaymentError)
    try {
      pfxToPkcs8Pem(pfx, 'not-the-password')
    } catch (error) {
      expect((error as PaymentError).code).toBe('INVALID_KEY')
    }
  })

  it('rejects malformed and empty input', () => {
    expect(() => pfxToPkcs8Pem(new Uint8Array(), 'x')).toThrow(PaymentError)
    expect(() => pfxToPkcs8Pem(new Uint8Array([1, 2, 3]), 'x')).toThrow(
      PaymentError
    )
  })
})

describe('fixture: the CREDENTIAL.pfx flow', () => {
  it('produces a PEM that core can load end to end', async () => {
    const { pfx } = loadTestPfx()
    const { privateKeyPem } = pfxToPkcs8Pem(pfx, TEST_PFX_PASSWORD)
    expect(privateKeyPem.trim().split('\n').length).toBeGreaterThan(3)
    await expect(importPkcs8PrivateKey(privateKeyPem)).resolves.toBeDefined()
  })
})
