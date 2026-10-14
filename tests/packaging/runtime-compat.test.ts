import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

/**
 * Packages that must run on Web-standard runtimes (Node, Bun, Deno, Cloudflare
 * Workers, browsers). The CLI and the connectIPS PFX decoder are Node-only and
 * excluded.
 */
const WEB_PACKAGES = [
  'core',
  'esewa',
  'khalti',
  'connectips',
  'fonepay',
  'mock',
] as const

const NODE_ONLY_FILES = ['packages/connectips/src/pfx.ts']

const NODE_BUILTINS = [
  'fs',
  'path',
  'crypto',
  'util',
  'os',
  'http',
  'https',
  'stream',
  'buffer',
  'events',
  'child_process',
  'net',
  'tls',
  'zlib',
  'url',
  'assert',
  'worker_threads',
  'async_hooks',
]

function listSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`
    if (statSync(path).isDirectory()) out.push(...listSources(path))
    else if (path.endsWith('.ts')) out.push(path)
  }
  return out
}

const importPattern = new RegExp(
  `(?:from|import)\\s*['"]([^'"]+)['"]|require\\(\\s*['"]([^'"]+)['"]\\s*\\)`,
  'g'
)

function importedSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2]
    if (specifier !== undefined) specifiers.push(specifier)
  }
  return specifiers
}

describe('runtime compatibility: Web-standard packages avoid Node builtins', () => {
  const sources = WEB_PACKAGES.flatMap((name) =>
    listSources(`${ROOT}packages/${name}/src`).map((path) => ({
      name,
      relative: path.slice(ROOT.length),
      source: readFileSync(path, 'utf8'),
    }))
  )

  it('found the expected packages', () => {
    expect(sources.length).toBeGreaterThan(0)
  })

  for (const { relative, source } of sources) {
    if (NODE_ONLY_FILES.includes(relative)) continue

    it(`${relative} imports no Node builtins`, () => {
      for (const specifier of importedSpecifiers(source)) {
        if (specifier.startsWith('node:')) {
          throw new Error(`${relative} imports ${specifier}`)
        }
        if (NODE_BUILTINS.includes(specifier)) {
          throw new Error(`${relative} imports ${specifier}`)
        }
      }
    })
  }

  it('only the PFX decoder reaches for node-forge', () => {
    for (const { relative, source } of sources) {
      const usesForge = importedSpecifiers(source).some((specifier) =>
        specifier.startsWith('node-forge')
      )
      if (usesForge) {
        expect(NODE_ONLY_FILES).toContain(relative)
      }
    }
  })
})

describe('runtime compatibility: Web Crypto is used for signing', () => {
  it('exposes globalThis.crypto.subtle', () => {
    expect(globalThis.crypto?.subtle).toBeDefined()
  })
})
