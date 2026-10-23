import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const GATEWAYS = ['esewa', 'khalti', 'connectips', 'fonepay', 'mock'] as const

const built = GATEWAYS.every((gateway) =>
  existsSync(`${ROOT}packages/${gateway}/dist/index.js`)
)

async function bundleInputs(gateway: string): Promise<string[]> {
  const result = await build({
    stdin: {
      contents: `export * from './packages/${gateway}/dist/index.js'`,
      resolveDir: ROOT,
      loader: 'js',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    metafile: true,
    logLevel: 'silent',
  })
  return Object.keys(result.metafile.inputs)
}

describe.skipIf(!built)('packaging: tree-shaking', () => {
  for (const gateway of GATEWAYS) {
    it(`importing @nepal-pay/${gateway} excludes other gateways`, async () => {
      const inputs = await bundleInputs(gateway)
      const joined = inputs.join('\n')

      expect(joined).toContain(`packages/${gateway}/dist/`)

      for (const other of GATEWAYS) {
        if (other === gateway) continue
        expect(joined).not.toContain(`packages/${other}/dist/`)
      }

      expect(joined).not.toContain('node-forge')
    })
  }

  it('the connectips PFX/Node-only entry stays out of the main bundle', async () => {
    const inputs = await bundleInputs('connectips')
    expect(inputs.join('\n')).not.toContain('pfx.js')
  })
})
