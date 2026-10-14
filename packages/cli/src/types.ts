/**
 * The environment a CLI command runs in. Kept injectable so commands can be
 * unit-tested without spawning a process or touching the real filesystem.
 */
export interface CliContext {
  readonly cwd: string
  readonly env: Record<string, string | undefined>
  readonly stdout: (message: string) => void
  readonly stderr: (message: string) => void
  readonly readFile: (path: string) => Promise<Uint8Array>
  readonly writeFile: (
    path: string,
    contents: string,
    mode: number
  ) => Promise<void>
  readonly fileExists: (path: string) => Promise<boolean>
  readonly readStdin: () => Promise<string>
}
