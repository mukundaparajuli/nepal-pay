import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const PACKAGES = [
  'core',
  'esewa',
  'khalti',
  'connectips',
  'fonepay',
  'mock',
  'cli',
] as const

interface PackageJson {
  readonly type?: string
  readonly main?: string
  readonly types?: string
  readonly sideEffects?: boolean
  readonly files?: readonly string[]
  readonly bin?: Record<string, string>
  readonly exports?: Record<
    string,
    { import?: string; types?: string; require?: string }
  >
}

function readPackageJson(name: string): PackageJson {
  return JSON.parse(
    readFileSync(`${ROOT}packages/${name}/package.json`, 'utf8')
  ) as PackageJson
}

function readBuilt(name: string, file: string): string | undefined {
  const path = `${ROOT}packages/${name}/dist/${file}`
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

const built = PACKAGES.every((name) =>
  existsSync(`${ROOT}packages/${name}/dist/index.js`)
)

describe.skipIf(!built)('packaging: build outputs', () => {
  for (const name of PACKAGES) {
    describe(`@nepal-payments/${name}`, () => {
      const pkg = readPackageJson(name)

      it('declares ESM metadata and exports', () => {
        expect(pkg.type).toBe('module')
        expect(pkg.main).toBe('dist/index.js')
        expect(pkg.types).toBe('dist/index.d.ts')
        const entry = pkg.exports?.['.']
        expect(entry?.import).toBe('./dist/index.js')
        expect(entry?.types).toBe('./dist/index.d.ts')
        expect(entry?.require).toBeUndefined()
        expect(pkg.files).toContain('dist')
      })

      it('is side-effect free', () => {
        if (name === 'cli') return
        expect(pkg.sideEffects).toBe(false)
      })

      it('ships JS, declarations, and source maps', () => {
        const js = readBuilt(name, 'index.js')
        const dts = readBuilt(name, 'index.d.ts')
        const map = readBuilt(name, 'index.js.map')
        expect(js).toBeDefined()
        expect(dts).toBeDefined()
        expect(map).toBeDefined()
        expect(js).toMatch(/\bexport\b/)
        expect(js).not.toMatch(/module\.exports/)
        const parsedMap = JSON.parse(map ?? '{}') as {
          version?: number
          sources?: unknown[]
        }
        expect(parsedMap.version).toBe(3)
        expect(Array.isArray(parsedMap.sources)).toBe(true)
      })
    })
  }

  it('exposes the npay bin', () => {
    const pkg = readPackageJson('cli')
    expect(pkg.bin?.['npay']).toBe('./dist/cli.js')
    expect(existsSync(`${ROOT}packages/cli/dist/cli.js`)).toBe(true)
  })
})
