import { describe, it, expect } from 'vitest'
import { importPkcs8PrivateKey, importSpkiPublicKey } from '@nepal-pay/core'
import {
  buildCheckoutTokenMessage,
  buildValidationTokenMessage,
  signConnectIpsToken,
  verifyConnectIpsToken,
} from '@nepal-pay/connectips'
import {
  testPrivateKeyPem,
  testPublicKeyPem,
  verifyTokenWithCert,
} from './helpers.js'

const CHECKOUT_VALUES = {
  MERCHANTID: '550',
  APPID: 'MER-550-APP-1',
  APPNAME: 'Test',
  TXNID: 'txn123',
  TXNDATE: '15-03-2022',
  TXNCRNCY: 'NPR',
  TXNAMT: '500',
  REFERENCEID: 'REF-001',
  REMARKS: 'RMKS-001',
  PARTICULARS: 'PART-001',
}

describe('buildCheckoutTokenMessage', () => {
  it('matches the NCHL documented field order and literals', () => {
    expect(buildCheckoutTokenMessage(CHECKOUT_VALUES)).toBe(
      'MERCHANTID=550,APPID=MER-550-APP-1,APPNAME=Test,TXNID=txn123,' +
        'TXNDATE=15-03-2022,TXNCRNCY=NPR,TXNAMT=500,REFERENCEID=REF-001,' +
        'REMARKS=RMKS-001,PARTICULARS=PART-001,TOKEN=TOKEN'
    )
  })
})

describe('buildValidationTokenMessage', () => {
  it('matches the NCHL documented validation string', () => {
    expect(
      buildValidationTokenMessage({
        merchantId: '550',
        appId: 'MER-550-APP-1',
        referenceId: 'txn-123',
        txnAmt: '500',
      })
    ).toBe('MERCHANTID=550,APPID=MER-550-APP-1,REFERENCEID=txn-123,TXNAMT=500')
  })
})

describe('signConnectIpsToken', () => {
  it('produces a base64 SHA256withRSA signature the certificate verifies', async () => {
    const message = buildCheckoutTokenMessage(CHECKOUT_VALUES)
    const key = await importPkcs8PrivateKey(testPrivateKeyPem())
    const signature = await signConnectIpsToken(message, key)

    expect(signature).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
    expect(verifyTokenWithCert(message, signature)).toBe(true)
  })

  it('verifies with the matching public key and rejects a wrong message', async () => {
    const message = buildValidationTokenMessage({
      merchantId: '550',
      appId: 'MER-550-APP-1',
      referenceId: 'txn-123',
      txnAmt: '500',
    })
    const key = await importPkcs8PrivateKey(testPrivateKeyPem())
    const signature = await signConnectIpsToken(message, key)
    const publicKey = await importSpkiPublicKey(testPublicKeyPem())

    await expect(
      verifyConnectIpsToken(message, signature, publicKey)
    ).resolves.toBe(true)
    await expect(
      verifyConnectIpsToken(`${message}x`, signature, publicKey)
    ).resolves.toBe(false)
  })
})
