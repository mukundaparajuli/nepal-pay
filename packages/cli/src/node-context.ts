import { access, chmod, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { CliContext } from './types.js'

/** A {@link CliContext} backed by the real Node process. */
export function createNodeContext(): CliContext {
  return {
    cwd: process.cwd(),
    env: process.env,
    stdout: (message) => {
      process.stdout.write(`${message}\n`)
    },
    stderr: (message) => {
      process.stderr.write(`${message}\n`)
    },
    readFile: (path) => readFile(resolve(path)),
    writeFile: async (path, contents, mode) => {
      const target = resolve(path)
      await writeFile(target, contents, { mode })
      await chmod(target, mode)
    },
    fileExists: async (path) => {
      try {
        await access(resolve(path))
        return true
      } catch {
        return false
      }
    },
    readDir: async (path) => {
      const entries = await readdir(resolve(path), { withFileTypes: true })
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
      }))
    },
    readStdin: () =>
      new Promise<string>((settle) => {
        let data = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', (chunk: string) => {
          data += chunk
        })
        process.stdin.on('end', () => {
          settle(data)
        })
        process.stdin.resume()
      }),
  }
}
