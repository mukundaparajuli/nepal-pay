import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const TEST_PFX_PASSWORD = 'connectips-test-password'

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
