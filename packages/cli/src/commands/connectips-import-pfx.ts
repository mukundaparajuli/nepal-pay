import { parseArgs } from 'node:util'
import { pfxToPkcs8Pem } from '@nepal-payments/connectips/pfx'
import { importPkcs8PrivateKey } from '@nepal-payments/core'
import type { CliContext } from '../types.js'

export const CONNECTIPS_IMPORT_PFX_USAGE = `Usage: npay connectips import-pfx <pfx> [options]

Convert an NCHL ConnectIPS CREDENTIAL .pfx (PKCS#12) into a PKCS#8 PEM private
key that @nepal-payments/connectips can load.

Options:
  --out <path>       Output private key path (default: <pfx>.key.pem)
  --cert-out <path>  Also write the leaf certificate PEM
  --password-stdin   Read the PFX password from stdin
  --force            Overwrite the output file if it exists
  -h, --help         Show this help

The password is read from the NPAY_PFX_PASSWORD environment variable or from
stdin via --password-stdin. It is never read from the command line.`

function defaultOutPath(input: string): string {
  return input.replace(/\.(pfx|p12)$/i, '') + '.key.pem'
}

async function resolvePassword(
  useStdin: boolean,
  ctx: CliContext
): Promise<string | undefined> {
  if (useStdin) {
    const raw = await ctx.readStdin()
    const password = raw.replace(/\r?\n$/, '')
    if (password.length === 0) {
      ctx.stderr('npay: stdin did not contain a password')
      return undefined
    }
    return password
  }
  const fromEnv = ctx.env.NPAY_PFX_PASSWORD
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv
  }
  ctx.stderr(
    'npay: no password provided; set NPAY_PFX_PASSWORD or pass --password-stdin'
  )
  return undefined
}

interface ParsedImportPfxArgs {
  readonly values: {
    readonly out?: string
    readonly 'cert-out'?: string
    readonly 'password-stdin': boolean
    readonly force: boolean
    readonly help: boolean
  }
  readonly positionals: string[]
}

/**
 * `npay connectips import-pfx`. Returns a process exit code.
 */
export async function runConnectIpsImportPfx(
  argv: string[],
  ctx: CliContext
): Promise<number> {
  let parsed: ParsedImportPfxArgs
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: 'string' },
        'cert-out': { type: 'string' },
        'password-stdin': { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
  } catch (error) {
    ctx.stderr(
      `npay: ${error instanceof Error ? error.message : String(error)}`
    )
    ctx.stderr(CONNECTIPS_IMPORT_PFX_USAGE)
    return 2
  }

  const { values, positionals } = parsed
  if (values.help) {
    ctx.stdout(CONNECTIPS_IMPORT_PFX_USAGE)
    return 0
  }

  const input = positionals[0]
  if (input === undefined) {
    ctx.stderr('npay: missing <pfx> path')
    ctx.stderr(CONNECTIPS_IMPORT_PFX_USAGE)
    return 2
  }
  if (positionals.length > 1) {
    ctx.stderr('npay: unexpected extra arguments')
    return 2
  }

  const password = await resolvePassword(values['password-stdin'], ctx)
  if (password === undefined) return 2

  let pfxBytes: Uint8Array
  try {
    pfxBytes = await ctx.readFile(input)
  } catch (error) {
    ctx.stderr(
      `npay: cannot read ${input}: ${error instanceof Error ? error.message : String(error)}`
    )
    return 1
  }

  let privateKeyPem: string
  let certificatePem: string | undefined
  try {
    const material = pfxToPkcs8Pem(pfxBytes, password)
    privateKeyPem = material.privateKeyPem
    certificatePem = material.certificatePem
  } catch (error) {
    ctx.stderr(
      `npay: ${error instanceof Error ? error.message : String(error)}`
    )
    return 1
  }

  try {
    await importPkcs8PrivateKey(privateKeyPem)
  } catch (error) {
    ctx.stderr(
      `npay: converted key is not a usable PKCS#8 RSA key: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return 1
  }

  const outPath = values.out ?? defaultOutPath(input)
  if (!values.force && (await ctx.fileExists(outPath))) {
    ctx.stderr(`npay: ${outPath} already exists (use --force to overwrite)`)
    return 1
  }

  await ctx.writeFile(outPath, privateKeyPem, 0o600)
  ctx.stdout(`Wrote PKCS#8 private key to ${outPath}`)

  if (values['cert-out'] !== undefined) {
    if (certificatePem === undefined) {
      ctx.stderr('npay: the PFX contains no certificate; --cert-out skipped')
    } else {
      await ctx.writeFile(values['cert-out'], certificatePem, 0o644)
      ctx.stdout(`Wrote certificate to ${values['cert-out']}`)
    }
  }

  return 0
}
