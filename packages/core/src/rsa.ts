import { PaymentError } from './errors.js'
import { base64DecodeBytes, base64EncodeBytes } from './utils.js'

/**
 * RSA helpers built on WebCrypto (`RSASSA-PKCS1-v1_5` with SHA-256), the
 * standard mapping of `SHA256withRSA`. Browser and Node (>=18) compatible.
 *
 * Only PKCS#8 private keys and SPKI public keys are supported. PKCS#12
 * (`.pfx`/`.p12`) archives are NOT parsed here. Convert them to PKCS#8 first
 * (see `@nepal-pay/connectips/pfx`).
 */

const RSA_PARAMS: RsaHashedImportParams = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256',
}

const utf8Encoder = new TextEncoder()

const PEM_PATTERN = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/

export type RsaPrivateKey = CryptoKey
export type RsaPublicKey = CryptoKey

function utf8Bytes(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(utf8Encoder.encode(value))
}

function decodePem(
  pem: string,
  expectedLabel: string
): Uint8Array<ArrayBuffer> {
  if (typeof pem !== 'string' || pem.length === 0) {
    throw new PaymentError(
      'RSA key must be a non-empty PEM string',
      'INVALID_KEY'
    )
  }
  const match = PEM_PATTERN.exec(pem)
  if (match === null) {
    throw new PaymentError(
      'RSA key is not a valid PEM block (missing BEGIN/END markers)',
      'INVALID_KEY'
    )
  }
  const label = match[1] ?? ''
  const body = (match[2] ?? '').replace(/\s+/g, '')
  if (label !== expectedLabel) {
    if (label === 'RSA PRIVATE KEY' && expectedLabel === 'PRIVATE KEY') {
      throw new PaymentError(
        'RSA key is PKCS#1 ("RSA PRIVATE KEY"); convert it to PKCS#8 ("PRIVATE KEY") first',
        'INVALID_KEY'
      )
    }
    if (label === 'ENCRYPTED PRIVATE KEY') {
      throw new PaymentError(
        'Encrypted PKCS#8 keys are not supported; decrypt the key first',
        'INVALID_KEY'
      )
    }
    throw new PaymentError(
      `RSA key must be a ${expectedLabel} PEM block, got ${label || 'unknown'}`,
      'INVALID_KEY'
    )
  }
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = new Uint8Array(base64DecodeBytes(body))
  } catch {
    throw new PaymentError(
      'RSA key PEM body is not valid base64',
      'INVALID_KEY'
    )
  }
  if (bytes.length === 0) {
    throw new PaymentError('RSA key PEM body is empty', 'INVALID_KEY')
  }
  return bytes
}

/** Import a PKCS#8 (`-----BEGIN PRIVATE KEY-----`) RSA private key for signing. */
export async function importPkcs8PrivateKey(
  pem: string
): Promise<RsaPrivateKey> {
  const der = decodePem(pem, 'PRIVATE KEY')
  try {
    return await crypto.subtle.importKey('pkcs8', der, RSA_PARAMS, false, [
      'sign',
    ])
  } catch {
    throw new PaymentError(
      'Failed to import PKCS#8 RSA private key; is it a valid RSA key?',
      'INVALID_KEY'
    )
  }
}

/** Import an SPKI (`-----BEGIN PUBLIC KEY-----`) RSA public key for verification. */
export async function importSpkiPublicKey(pem: string): Promise<RsaPublicKey> {
  const der = decodePem(pem, 'PUBLIC KEY')
  try {
    return await crypto.subtle.importKey('spki', der, RSA_PARAMS, true, [
      'verify',
    ])
  } catch {
    throw new PaymentError(
      'Failed to import SPKI RSA public key; is it a valid RSA key?',
      'INVALID_KEY'
    )
  }
}

/** Sign UTF-8 `data` with SHA256withRSA; returns a standard base64 signature. */
export async function rsaSha256Sign(
  data: string,
  key: RsaPrivateKey
): Promise<string> {
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    utf8Bytes(data)
  )
  return base64EncodeBytes(new Uint8Array(signature))
}

/**
 * Verify a base64 SHA256withRSA signature over UTF-8 `data`. Returns `false`
 * for a malformed signature rather than throwing.
 */
export async function rsaSha256Verify(
  data: string,
  signature: string,
  key: RsaPublicKey
): Promise<boolean> {
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = new Uint8Array(base64DecodeBytes(signature))
  } catch {
    return false
  }
  try {
    return await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      bytes,
      utf8Bytes(data)
    )
  } catch {
    return false
  }
}
