import { describe, it, expect } from 'vitest'
import {
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
} from 'node:crypto'
import {
  importPkcs8PrivateKey,
  importSpkiPublicKey,
  rsaSha256Sign,
  rsaSha256Verify,
  PaymentError,
} from '@nepal-payments/core'

function makeKeyPair(): {
  pkcs8Pem: string
  spkiPem: string
  pkcs1Pem: string
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey']
  publicKey: ReturnType<typeof generateKeyPairSync>['publicKey']
} {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })
  return {
    pkcs8Pem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    spkiPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
    pkcs1Pem: privateKey.export({ type: 'pkcs1', format: 'pem' }) as string,
    privateKey,
    publicKey,
  }
}

describe('importPkcs8PrivateKey / importSpkiPublicKey', () => {
  it('imports a PKCS#8 private key and an SPKI public key', async () => {
    const { pkcs8Pem, spkiPem } = makeKeyPair()
    const priv = await importPkcs8PrivateKey(pkcs8Pem)
    const pub = await importSpkiPublicKey(spkiPem)
    expect(priv.type).toBe('private')
    expect(pub.type).toBe('public')
  })

  it('rejects a PKCS#1 key with a helpful message', async () => {
    const { pkcs1Pem } = makeKeyPair()
    await expect(importPkcs8PrivateKey(pkcs1Pem)).rejects.toMatchObject({
      code: 'INVALID_KEY',
    })
    await expect(importPkcs8PrivateKey(pkcs1Pem)).rejects.toThrow(/PKCS#1/)
  })

  it('rejects empty and malformed PEM', async () => {
    await expect(importPkcs8PrivateKey('')).rejects.toBeInstanceOf(PaymentError)
    await expect(importPkcs8PrivateKey('not a pem')).rejects.toMatchObject({
      code: 'INVALID_KEY',
    })
  })

  it('rejects an SPKI label when a private key is expected', async () => {
    const { spkiPem } = makeKeyPair()
    await expect(importPkcs8PrivateKey(spkiPem)).rejects.toMatchObject({
      code: 'INVALID_KEY',
    })
  })
})

describe('rsaSha256Sign', () => {
  it('produces a signature verifiable by Node crypto (interop)', async () => {
    const { pkcs8Pem, publicKey } = makeKeyPair()
    const priv = await importPkcs8PrivateKey(pkcs8Pem)
    const data = 'MERCHANTID=1,TXNAMT=23000'
    const signature = await rsaSha256Sign(data, priv)
    const ok = nodeVerify(
      'RSA-SHA256',
      Buffer.from(data, 'utf8'),
      publicKey,
      Buffer.from(signature, 'base64')
    )
    expect(ok).toBe(true)
  })
})

describe('rsaSha256Verify', () => {
  it('verifies a signature produced by Node crypto (interop)', async () => {
    const { spkiPem, privateKey } = makeKeyPair()
    const pub = await importSpkiPublicKey(spkiPem)
    const data = 'PRN=ORD-1,PID=NB001'
    const nodeSignature = nodeSign(
      'RSA-SHA256',
      Buffer.from(data, 'utf8'),
      privateKey
    )
    const ok = await rsaSha256Verify(
      data,
      nodeSignature.toString('base64'),
      pub
    )
    expect(ok).toBe(true)
  })

  it('rejects a tampered payload and a tampered signature', async () => {
    const { pkcs8Pem, spkiPem } = makeKeyPair()
    const priv = await importPkcs8PrivateKey(pkcs8Pem)
    const pub = await importSpkiPublicKey(spkiPem)
    const signature = await rsaSha256Sign('original', priv)
    expect(await rsaSha256Verify('original', signature, pub)).toBe(true)
    expect(await rsaSha256Verify('tampered', signature, pub)).toBe(false)
    expect(await rsaSha256Verify('original', 'AAAA', pub)).toBe(false)
  })

  it('returns false for a malformed base64 signature', async () => {
    const { spkiPem } = makeKeyPair()
    const pub = await importSpkiPublicKey(spkiPem)
    expect(await rsaSha256Verify('data', '!!!!', pub)).toBe(false)
  })

  it('rejects a signature made with a different key', async () => {
    const first = makeKeyPair()
    const second = makeKeyPair()
    const priv = await importPkcs8PrivateKey(first.pkcs8Pem)
    const otherPub = await importSpkiPublicKey(second.spkiPem)
    const signature = await rsaSha256Sign('payload', priv)
    expect(await rsaSha256Verify('payload', signature, otherPub)).toBe(false)
  })
})
