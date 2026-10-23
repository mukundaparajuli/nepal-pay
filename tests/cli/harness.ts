import type { CliContext, DirEntry } from '@nepal-pay/cli'

export interface TestHarness {
  readonly ctx: CliContext
  readonly files: Map<string, string>
  readonly binaryFiles: Map<string, Uint8Array>
  readonly dirs: Set<string>
  readonly stdout: string[]
  readonly stderr: string[]
  seedFile(path: string, contents: string): void
  seedBytes(path: string, bytes: Uint8Array): void
  seedDir(path: string): void
}

/**
 * An in-memory {@link CliContext}. Directories are inferred from seeded file
 * paths plus any explicitly seeded empty directories.
 */
export function makeHarness(options?: {
  env?: Record<string, string | undefined>
  stdin?: string
}): TestHarness {
  const files = new Map<string, string>()
  const binaryFiles = new Map<string, Uint8Array>()
  const dirs = new Set<string>()
  const stdout: string[] = []
  const stderr: string[] = []

  const entriesFor = (dir: string): DirEntry[] => {
    const prefix = dir.length === 0 ? '' : `${dir}/`
    const names = new Map<string, boolean>()
    const add = (full: string): void => {
      if (!full.startsWith(prefix)) return
      const rest = full.slice(prefix.length)
      if (rest.length === 0) return
      const slash = rest.indexOf('/')
      if (slash === -1) names.set(rest, dirs.has(full))
      else names.set(rest.slice(0, slash), true)
    }
    for (const path of files.keys()) add(path)
    for (const path of binaryFiles.keys()) add(path)
    for (const path of dirs) add(path)
    if (names.size === 0) throw new Error(`ENOENT: ${dir}`)
    return [...names].map(([name, isDirectory]) => ({ name, isDirectory }))
  }

  const ctx: CliContext = {
    cwd: '/work',
    env: options?.env ?? {},
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
    readFile: async (path) => {
      const binary = binaryFiles.get(path)
      if (binary !== undefined) return binary
      const text = files.get(path)
      if (text !== undefined) return new TextEncoder().encode(text)
      throw new Error(`ENOENT: no such file ${path}`)
    },
    writeFile: async (path, contents) => {
      files.set(path, contents)
    },
    fileExists: async (path) => files.has(path) || binaryFiles.has(path),
    readDir: async (path) => entriesFor(path),
    readStdin: async () => options?.stdin ?? '',
  }

  return {
    ctx,
    files,
    binaryFiles,
    dirs,
    stdout,
    stderr,
    seedFile: (path, contents) => files.set(path, contents),
    seedBytes: (path, bytes) => binaryFiles.set(path, bytes),
    seedDir: (path) => dirs.add(path),
  }
}
