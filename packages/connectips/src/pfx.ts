import forge from 'node-forge'
import { PaymentError } from '@nepal-payments/core'

/**
 * PKCS#12 (`.pfx`/`.p12`) → PKCS#8 conversion.
 *
 * WebCrypto cannot parse PKCS#12 archives, so this module uses `node-forge`.
 * It is Node-only and lives behind the `@nepal-payments/connectips/pfx`
 * subpath so browser bundles never pull in `node-forge`.
 *
 * The emitted private key is PKCS#8 (`-----BEGIN PRIVATE KEY-----`), which
 * `@nepal-payments/core`'s `importPkcs8PrivateKey` accepts directly.
 */

export interface Pkcs8KeyMaterial {
  /** PKCS#8 private key PEM. */
  readonly privateKeyPem: string
  /** The leaf certificate PEM, when the archive contains one. */
  readonly certificatePem?: string
  /** All certificates in the archive, PEM-joined, when present. */
  readonly certificateChainPem?: string
  /** Caller-supplied label (node-forge bag names are not exposed). */
  readonly friendlyName?: string
}

export interface PfxToPkcs8Options {
  readonly friendlyName?: string
}

const KEY_BAG_TYPES = ['pkcs8ShroudedKeyBag', 'keyBag'] as const

function toBinaryString(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return binary
}

type Bags = Record<string, forge.pkcs12.Bag[] | undefined>

function findPrivateKey(p12: forge.pkcs12.Pkcs12Pfx): forge.pki.rsa.PrivateKey {
  const found: forge.pkcs12.Bag[] = []
  for (const name of KEY_BAG_TYPES) {
    const bagType = forge.pki.oids[name]
    if (bagType === undefined) continue
    const bags = (p12.getBags({ bagType }) as Bags)[bagType]
    if (bags !== undefined) found.push(...bags)
  }
  for (const bag of found) {
    if (bag.key !== undefined) return bag.key
  }
  throw new PaymentError(
    'PFX archive does not contain a private key',
    'INVALID_KEY'
  )
}

function findCertificates(
  p12: forge.pkcs12.Pkcs12Pfx
): forge.pki.Certificate[] {
  const bagType = forge.pki.oids.certBag
  if (bagType === undefined) return []
  const bags = (p12.getBags({ bagType }) as Bags)[bagType] ?? []
  const certificates: forge.pki.Certificate[] = []
  for (const bag of bags) {
    if (bag.cert !== undefined) certificates.push(bag.cert)
  }
  return certificates
}

/**
 * Convert a PKCS#12 archive to PKCS#8 (private key) plus any certificates.
 *
 * @throws {PaymentError} with code `INVALID_KEY` for a bad file or password.
 */
export function pfxToPkcs8Pem(
  pfx: Uint8Array,
  password: string,
  options: PfxToPkcs8Options = {}
): Pkcs8KeyMaterial {
  if (!(pfx instanceof Uint8Array) || pfx.length === 0) {
    throw new PaymentError(
      'PFX input must be a non-empty Uint8Array',
      'INVALID_KEY'
    )
  }
  if (typeof password !== 'string') {
    throw new PaymentError('PFX password must be a string', 'INVALID_KEY')
  }

  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    const asn1 = forge.asn1.fromDer(
      forge.util.createBuffer(toBinaryString(pfx))
    )
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password)
  } catch (error) {
    throw new PaymentError(
      'Failed to parse the PFX archive; check the file and password',
      'INVALID_KEY',
      { reason: error instanceof Error ? error.message : String(error) }
    )
  }

  const key = findPrivateKey(p12)
  let privateKeyPem: string
  try {
    const privateKeyAsn1 = forge.pki.privateKeyToAsn1(key)
    const privateKeyInfo = forge.pki.wrapRsaPrivateKey(privateKeyAsn1)
    privateKeyPem = forge.pki.privateKeyInfoToPem(privateKeyInfo)
  } catch {
    throw new PaymentError('PFX private key is not an RSA key', 'INVALID_KEY')
  }

  const certificates = findCertificates(p12)
  const certificatePems = certificates.map((cert) =>
    forge.pki.certificateToPem(cert)
  )

  const result: {
    privateKeyPem: string
    certificatePem?: string
    certificateChainPem?: string
    friendlyName?: string
  } = { privateKeyPem }

  if (certificatePems[0] !== undefined) {
    result.certificatePem = certificatePems[0]
  }
  if (certificatePems.length > 0) {
    result.certificateChainPem = certificatePems.join('\n')
  }
  if (options.friendlyName !== undefined) {
    result.friendlyName = options.friendlyName
  }

  return result
}
