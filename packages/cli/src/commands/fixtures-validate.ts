import { parseArgs } from 'node:util'
import {
  PAYMENT_ERROR_CODES,
  PAYMENT_STATUSES,
  isPaymentErrorCode,
  isPaymentStatus,
} from '@nepal-pay/core'
import type { CliContext, DirEntry } from '../types.js'

export const FIXTURES_VALIDATE_USAGE = `Usage: npay fixtures validate [dir] [options]

Recursively parse every JSON fixture/vector under <dir> and check that the
data matches the shapes the test suite expects: callback malformed cases carry
a known error code, status vectors map to known statuses, and amount vectors
reference only known error codes.

Options:
  -h, --help   Show this help

Exit code is 1 if any fixture is invalid.`

export interface ValidationProblem {
  readonly file: string
  readonly message: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function childPath(parent: string, name: string): string {
  return parent.length === 0 ? name : `${parent}/${name}`
}

function kindOf(file: string): string | undefined {
  const match = /\/vectors\/([^/]+)\//.exec(file)
  return match?.[1]
}

async function collectJson(dir: string, ctx: CliContext): Promise<string[]> {
  const files: string[] = []
  const walk = async (current: string): Promise<void> => {
    const entries: readonly DirEntry[] = await ctx.readDir(current)
    for (const entry of entries) {
      const path = childPath(current, entry.name)
      if (entry.isDirectory) {
        await walk(path)
      } else if (entry.name.endsWith('.json')) {
        files.push(path)
      }
    }
  }
  await walk(dir)
  return files.sort()
}

/** Any `error` string anywhere must be a known {@link PAYMENT_ERROR_CODES}. */
function checkErrorCodes(
  value: unknown,
  file: string,
  problems: ValidationProblem[]
): void {
  if (isArray(value)) {
    for (const item of value) checkErrorCodes(item, file, problems)
    return
  }
  if (!isRecord(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (key === 'error' && typeof child === 'string') {
      if (!isPaymentErrorCode(child)) {
        problems.push({
          file,
          message: `unknown error code "${child}"`,
        })
      }
    } else {
      checkErrorCodes(child, file, problems)
    }
  }
}

function validateSignatures(
  data: unknown,
  file: string,
  problems: ValidationProblem[]
): void {
  if (!isRecord(data)) {
    problems.push({ file, message: 'signatures vector must be an object' })
    return
  }
  if (data['cases'] === undefined) return
  if (!isArray(data['cases'])) {
    problems.push({ file, message: 'signatures.cases must be an array' })
    return
  }
  data['cases'].forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry['name'] !== 'string') {
      problems.push({
        file,
        message: `signatures.cases[${index}] must have a string "name"`,
      })
    }
  })
}

function validateCallbacks(
  data: unknown,
  file: string,
  problems: ValidationProblem[]
): void {
  if (!isRecord(data)) {
    problems.push({ file, message: 'callback vector must be an object' })
    return
  }
  if (!isRecord(data['request'])) {
    problems.push({ file, message: 'callback vector needs a "request" object' })
  }
  if (!isRecord(data['expectedParse'])) {
    problems.push({
      file,
      message: 'callback vector needs an "expectedParse" object',
    })
  }
  const malformed = data['malformed']
  if (malformed === undefined) return
  if (!isArray(malformed)) {
    problems.push({
      file,
      message: 'callback vector "malformed" must be an array',
    })
    return
  }
  malformed.forEach((entry, index) => {
    if (!isRecord(entry)) {
      problems.push({
        file,
        message: `malformed[${index}] must be an object`,
      })
      return
    }
    if (typeof entry['name'] !== 'string') {
      problems.push({
        file,
        message: `malformed[${index}] needs a string "name"`,
      })
    }
    if (!isRecord(entry['request'])) {
      problems.push({
        file,
        message: `malformed[${index}] needs a "request" object`,
      })
    }
    if (!('error' in entry)) {
      problems.push({
        file,
        message: `malformed[${index}] needs an "error" key`,
      })
    }
  })
}

function validateAmounts(
  data: unknown,
  file: string,
  problems: ValidationProblem[]
): void {
  if (!isRecord(data)) {
    problems.push({ file, message: 'amount vector must be an object' })
    return
  }
  if (data['cases'] !== undefined && !isArray(data['cases'])) {
    problems.push({ file, message: 'amounts.cases must be an array' })
  }
}

function validateStatuses(
  data: unknown,
  file: string,
  problems: ValidationProblem[]
): void {
  if (!isRecord(data)) {
    problems.push({ file, message: 'status vector must be an object' })
    return
  }
  if (data['statuses'] !== undefined) {
    if (!isArray(data['statuses'])) {
      problems.push({ file, message: 'statuses must be an array' })
    } else {
      data['statuses'].forEach((status, index) => {
        if (!isPaymentStatus(status)) {
          problems.push({
            file,
            message: `statuses[${index}] is not a known status: ${String(status)}`,
          })
        }
      })
    }
  }
  if (data['cases'] === undefined) return
  if (!isArray(data['cases'])) {
    problems.push({ file, message: 'statuses.cases must be an array' })
    return
  }
  data['cases'].forEach((entry, index) => {
    if (!isRecord(entry)) {
      problems.push({
        file,
        message: `statuses.cases[${index}] must be an object`,
      })
      return
    }
    if (
      entry['expected'] !== undefined &&
      !isPaymentStatus(entry['expected'])
    ) {
      problems.push({
        file,
        message: `statuses.cases[${index}].expected is not a known status: ${String(
          entry['expected']
        )}`,
      })
    }
  })
}

function validateData(
  data: unknown,
  file: string,
  problems: ValidationProblem[]
): void {
  checkErrorCodes(data, file, problems)
  switch (kindOf(file)) {
    case 'signatures':
      validateSignatures(data, file, problems)
      break
    case 'callbacks':
      validateCallbacks(data, file, problems)
      break
    case 'amounts':
      validateAmounts(data, file, problems)
      break
    case 'statuses':
      validateStatuses(data, file, problems)
      break
    default:
      break
  }
}

/** Validate every JSON file under `dir`. Exported for tests. */
export async function validateFixtures(
  dir: string,
  ctx: CliContext
): Promise<ValidationProblem[]> {
  const problems: ValidationProblem[] = []
  let files: string[]
  try {
    files = await collectJson(dir, ctx)
  } catch (error) {
    return [
      {
        file: dir,
        message: `cannot read directory: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    ]
  }

  for (const file of files) {
    let text: string
    try {
      text = new TextDecoder().decode(await ctx.readFile(file))
    } catch (error) {
      problems.push({
        file,
        message: `cannot read file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
      continue
    }
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch (error) {
      problems.push({
        file,
        message: `invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
      continue
    }
    validateData(data, file, problems)
  }

  return problems
}

interface ParsedFixturesArgs {
  readonly values: { readonly help: boolean }
  readonly positionals: string[]
}

/** `npay fixtures validate`. Returns a process exit code. */
export async function runFixturesValidate(
  argv: string[],
  ctx: CliContext
): Promise<number> {
  let parsed: ParsedFixturesArgs
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
  } catch (error) {
    ctx.stderr(
      `npay: ${error instanceof Error ? error.message : String(error)}`
    )
    ctx.stderr(FIXTURES_VALIDATE_USAGE)
    return 2
  }

  if (parsed.values.help) {
    ctx.stdout(FIXTURES_VALIDATE_USAGE)
    return 0
  }
  if (parsed.positionals.length > 1) {
    ctx.stderr('npay: unexpected extra arguments')
    return 2
  }

  const dir = parsed.positionals[0] ?? 'tests'
  const problems = await validateFixtures(dir, ctx)
  if (problems.length > 0) {
    ctx.stderr(`FAIL: ${problems.length} fixture problem(s) under ${dir}`)
    for (const problem of problems) {
      ctx.stderr(`  ${problem.file}: ${problem.message}`)
    }
    return 1
  }

  ctx.stdout(`OK: fixtures under ${dir} validated`)
  ctx.stdout(`Known error codes: ${PAYMENT_ERROR_CODES.length}`)
  ctx.stdout(`Known statuses:    ${PAYMENT_STATUSES.join(', ')}`)
  return 0
}
