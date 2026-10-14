import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createPublicKey, verify as nodeVerify } from 'node:crypto'
import { pfxToPkcs8Pem } from '@nepal-payments/connectips/pfx'
import type { ConnectIpsConfig } from '@nepal-payments/connectips'

export const TEST_PFX_PASSWORD = 'connectips-test-password'

export const TEST_MERCHANT_ID = '550'
export const TEST_APP_ID = 'MER-550-APP-1'
export const TEST_APP_NAME = 'Test Merchant'
export const TEST_PASSWORD = 'secret-password'
export const FIXED_DATE = new Date('2022-03-15T00:00:00Z')

const FIXTURE_DIR = fileURLToPath(
  new URL('../fixtures/connectips/', import.meta.url)
)

export interface TestPfx {
  readonly pfx: Uint8Array
  readonly certificatePem: string
}

let cached: TestPfx | undefined

/**
 * Load the checked-in NCHL-style `CREDENTIAL.pfx` fixture (a self-signed RSA
 * credential packed as PKCS#12) plus its leaf certificate.
 */
export function loadTestPfx(): TestPfx {
  if (cached === undefined) {
    cached = {
      pfx: new Uint8Array(readFileSync(`${FIXTURE_DIR}creditor.pfx`)),
      certificatePem: readFileSync(`${FIXTURE_DIR}creditor.crt.pem`, 'utf8'),
    }
  }
  return cached
}

let cachedKeyPem: string | undefined

/** The fixture private key converted to PKCS#8 PEM. */
export function testPrivateKeyPem(): string {
  if (cachedKeyPem === undefined) {
    const { pfx } = loadTestPfx()
    cachedKeyPem = pfxToPkcs8Pem(pfx, TEST_PFX_PASSWORD).privateKeyPem
  }
  return cachedKeyPem
}

/** Verify a token against the fixture certificate's public key. */
export function verifyTokenWithCert(
  message: string,
  signature: string
): boolean {
  const { certificatePem } = loadTestPfx()
  const publicKey = createPublicKey(certificatePem)
  return nodeVerify(
    'RSA-SHA256',
    Buffer.from(message, 'utf8'),
    publicKey,
    Buffer.from(signature, 'base64')
  )
}

let cachedPublicKeyPem: string | undefined

/** The fixture certificate's public key as an SPKI PEM. */
export function testPublicKeyPem(): string {
  if (cachedPublicKeyPem === undefined) {
    const { certificatePem } = loadTestPfx()
    cachedPublicKeyPem = createPublicKey(certificatePem).export({
      type: 'spki',
      format: 'pem',
    }) as string
  }
  return cachedPublicKeyPem
}

/** A connectIPS config wired to the fixture key and a stub fetch. */
export function testConfig(
  overrides: Partial<ConnectIpsConfig> = {}
): ConnectIpsConfig {
  return {
    merchantId: TEST_MERCHANT_ID,
    appId: TEST_APP_ID,
    appName: TEST_APP_NAME,
    password: TEST_PASSWORD,
    privateKey: testPrivateKeyPem(),
    environment: 'sandbox',
    now: () => FIXED_DATE,
    ...overrides,
  }
}
