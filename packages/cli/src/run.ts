import type { CliContext } from './types.js'
import { runConnectIpsImportPfx } from './commands/connectips-import-pfx.js'
import { runInit } from './commands/init.js'
import { runGatewayTest } from './commands/gateway-test.js'
import { runFixturesValidate } from './commands/fixtures-validate.js'

export const ROOT_USAGE = `npay — Nepal payments SDK command line

Usage: npay <command> [options]

Commands:
  init [options]                Write a .env.example template
  gateway test [gateway]        Smoke-test a gateway offline
  fixtures validate [dir]       Validate JSON fixtures/vectors
  connectips import-pfx <pfx>   Convert a ConnectIPS CREDENTIAL .pfx to PKCS#8

Run "npay <command> --help" for command options.`

/**
 * Dispatch a CLI invocation. `argv` excludes the node executable and script
 * path. Returns a process exit code (0 success).
 */
export async function runCli(argv: string[], ctx: CliContext): Promise<number> {
  const [group, command, ...rest] = argv

  if (
    group === undefined ||
    group === 'help' ||
    group === '--help' ||
    group === '-h'
  ) {
    ctx.stdout(ROOT_USAGE)
    return group === undefined ? 1 : 0
  }

  if (group === 'init') {
    return runInit(argv.slice(1), ctx)
  }

  if (group === 'fixtures') {
    if (command === undefined || command === '--help' || command === '-h') {
      ctx.stdout(ROOT_USAGE)
      return command === undefined ? 1 : 0
    }
    if (command === 'validate') {
      return runFixturesValidate(rest, ctx)
    }
    ctx.stderr(`npay: unknown fixtures command: ${command}`)
    ctx.stderr(ROOT_USAGE)
    return 2
  }

  if (group === 'gateway') {
    if (command === undefined || command === '--help' || command === '-h') {
      ctx.stdout(ROOT_USAGE)
      return command === undefined ? 1 : 0
    }
    if (command === 'test') {
      return runGatewayTest(rest, ctx)
    }
    ctx.stderr(`npay: unknown gateway command: ${command}`)
    ctx.stderr(ROOT_USAGE)
    return 2
  }

  if (group === 'connectips') {
    if (command === undefined || command === '--help' || command === '-h') {
      ctx.stdout(ROOT_USAGE)
      return command === undefined ? 1 : 0
    }
    if (command === 'import-pfx') {
      return runConnectIpsImportPfx(rest, ctx)
    }
    ctx.stderr(`npay: unknown connectips command: ${command}`)
    ctx.stderr(ROOT_USAGE)
    return 2
  }

  ctx.stderr(`npay: unknown command: ${group}`)
  ctx.stderr(ROOT_USAGE)
  return 2
}
