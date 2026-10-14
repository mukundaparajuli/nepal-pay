import { parseArgs } from 'node:util'
import {
  createOrder,
  moneyFromDecimal,
  type GatewayAdapter,
  type Order,
  type PaymentMethod,
} from '@nepal-payments/core'
import { createEsewa } from '@nepal-payments/esewa'
import { createKhalti } from '@nepal-payments/khalti'
import { createConnectIps } from '@nepal-payments/connectips'
import { createFonepay } from '@nepal-payments/fonepay'
import { createMockGateway } from '@nepal-payments/mock'
import { GATEWAY_DESCRIPTORS, isGatewayMethod } from '../gateways.js'
import type { CliContext } from '../types.js'

export const GATEWAY_TEST_USAGE = `Usage: npay gateway test [gateway] [options]

Run an offline smoke test of the SDK lifecycle for a gateway. No network
requests are made and no real payment is created.

  mock        (default) full lifecycle: checkout → callback → verify → status
  esewa | khalti | connectips | fonepay
              build the adapter from environment variables and construct a
              checkout. Missing variables are reported.

Options:
  --order-id <id>   Order id to use (default: NPAY-SMOKE)
  --amount <dec>    Amount as a decimal string (default: 100.00)
  -h, --help        Show this help

Environment variables are documented in .env.example (\`npay init\`).`

const DEFAULT_ORDER_ID = 'NPAY-SMOKE'
const DEFAULT_AMOUNT = '100.00'
const DEFAULT_RETURN_URL = 'https://example.com/payments/return'

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

function environment(value: string | undefined): 'sandbox' | 'production' {
  return value === 'production' ? 'production' : 'sandbox'
}

/** A fetch stub so checkout construction never touches the network. */
function stubFetch(): Promise<Response> {
  return Promise.resolve(
    new Response(
      JSON.stringify({
        pidx: 'npay-smoke-pidx',
        payment_url: 'https://example.com/payments/smoke',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  )
}

function missingConfig(
  method: PaymentMethod,
  env: Record<string, string | undefined>
): string[] {
  const missing: string[] = []
  const need = (name: string, ok = isNonEmpty(env[name])) => {
    if (!ok) missing.push(name)
  }
  switch (method) {
    case 'esewa':
      need('ESEWA_MERCHANT_CODE')
      need('ESEWA_SECRET')
      break
    case 'khalti':
      need('KHALTI_SECRET_KEY')
      need('KHALTI_RETURN_URL')
      break
    case 'fonepay':
      need('FONEPAY_PID')
      need('FONEPAY_SECRET_KEY')
      need('FONEPAY_RETURN_URL')
      break
    case 'connectips':
      need('CONNECTIPS_MERCHANT_ID')
      need('CONNECTIPS_APP_ID')
      need('CONNECTIPS_APP_NAME')
      need('CONNECTIPS_PASSWORD')
      need(
        'CONNECTIPS_PRIVATE_KEY_PATH or CONNECTIPS_PRIVATE_KEY_PEM',
        isNonEmpty(env['CONNECTIPS_PRIVATE_KEY_PATH']) ||
          isNonEmpty(env['CONNECTIPS_PRIVATE_KEY_PEM'])
      )
      break
    case 'mock':
      break
  }
  return missing
}

async function connectipsKey(
  env: Record<string, string | undefined>,
  ctx: CliContext
): Promise<string> {
  const path = env['CONNECTIPS_PRIVATE_KEY_PATH']
  if (isNonEmpty(path)) {
    const bytes = await ctx.readFile(path)
    return new TextDecoder().decode(bytes)
  }
  const pem = env['CONNECTIPS_PRIVATE_KEY_PEM'] ?? ''
  return pem.replace(/\\n/g, '\n')
}

interface GatewayTestOptions {
  readonly orderId: string
  readonly amount: string
}

async function buildReal(
  method: Exclude<PaymentMethod, 'mock'>,
  env: Record<string, string | undefined>,
  ctx: CliContext
): Promise<GatewayAdapter> {
  const str = (name: string): string => env[name] ?? ''
  const fetch = stubFetch as unknown as typeof globalThis.fetch
  const returnUrl = DEFAULT_RETURN_URL
  switch (method) {
    case 'esewa':
      return createEsewa({
        merchantCode: str('ESEWA_MERCHANT_CODE'),
        secret: str('ESEWA_SECRET'),
        environment: environment(env['ESEWA_ENVIRONMENT']),
        successUrl: returnUrl,
        failureUrl: returnUrl,
        fetch,
      })
    case 'khalti':
      return createKhalti({
        secretKey: str('KHALTI_SECRET_KEY'),
        environment: environment(env['KHALTI_ENVIRONMENT']),
        returnUrl: env['KHALTI_RETURN_URL'],
        fetch,
      })
    case 'connectips':
      return createConnectIps({
        merchantId: str('CONNECTIPS_MERCHANT_ID'),
        appId: str('CONNECTIPS_APP_ID'),
        appName: str('CONNECTIPS_APP_NAME'),
        password: str('CONNECTIPS_PASSWORD'),
        privateKey: await connectipsKey(env, ctx),
        environment: environment(env['CONNECTIPS_ENVIRONMENT']),
        fetch,
      })
    case 'fonepay':
      return createFonepay({
        merchantCode: str('FONEPAY_PID'),
        secretKey: str('FONEPAY_SECRET_KEY'),
        environment: environment(env['FONEPAY_ENVIRONMENT']),
        returnUrl: env['FONEPAY_RETURN_URL'],
        fetch,
        serverVerification: false,
      })
  }
}

function sampleOrder(options: GatewayTestOptions): Order {
  return createOrder({
    id: options.orderId,
    amount: moneyFromDecimal(options.amount),
    returnUrl: DEFAULT_RETURN_URL,
    failureUrl: DEFAULT_RETURN_URL,
  })
}

async function runMock(
  ctx: CliContext,
  options: GatewayTestOptions
): Promise<number> {
  const gateway = createMockGateway({
    secretKey: ctx.env['NPAY_MOCK_SECRET'] ?? 'npay-smoke-secret',
  })
  const order = sampleOrder(options)

  const { checkout, txnRef } = await gateway.createCheckout(order)
  ctx.stdout(`  ok createCheckout        ${checkout.type} -> ${checkout.url}`)

  await gateway.pay(txnRef)
  ctx.stdout('  ok pay                   simulated payer')

  const raw = await gateway.generateCallback(txnRef)
  ctx.stdout('  ok generateCallback')

  const callback = gateway.parseCallback(raw)
  ctx.stdout('  ok parseCallback')

  const payment = await gateway.verify(callback, { expected: order })
  if (payment.status !== 'completed') {
    ctx.stderr(
      `  xx verify                expected completed, got ${payment.status}`
    )
    return 1
  }
  ctx.stdout('  ok verify                status=completed')

  const status = await gateway.status(txnRef, { expected: order })
  ctx.stdout(`  ok status                status=${status.status}`)

  ctx.stdout('PASS (mock): full lifecycle')
  return 0
}

async function runReal(
  method: Exclude<PaymentMethod, 'mock'>,
  ctx: CliContext,
  options: GatewayTestOptions
): Promise<number> {
  const missing = missingConfig(method, ctx.env)
  if (missing.length > 0) {
    ctx.stderr(`FAIL (${method}): missing configuration`)
    for (const name of missing) ctx.stderr(`  - ${name}`)
    ctx.stderr('Set the variables (see .env.example) and retry.')
    return 1
  }

  const gateway = await buildReal(method, ctx.env, ctx)
  ctx.stdout(`  ok config                ${GATEWAY_DESCRIPTORS[method].title}`)

  const order = sampleOrder(options)
  const { checkout } = await gateway.createCheckout(order)
  ctx.stdout(`  ok createCheckout        ${checkout.type} -> ${checkout.url}`)
  ctx.stdout(`PASS (${method}): adapter constructed and checkout built offline`)
  return 0
}

interface ParsedGatewayTestArgs {
  readonly values: {
    readonly 'order-id'?: string
    readonly amount?: string
    readonly help: boolean
  }
  readonly positionals: string[]
}

/** `npay gateway test`. Returns a process exit code. */
export async function runGatewayTest(
  argv: string[],
  ctx: CliContext
): Promise<number> {
  let parsed: ParsedGatewayTestArgs
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'order-id': { type: 'string' },
        amount: { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
  } catch (error) {
    ctx.stderr(
      `npay: ${error instanceof Error ? error.message : String(error)}`
    )
    ctx.stderr(GATEWAY_TEST_USAGE)
    return 2
  }

  if (parsed.values.help) {
    ctx.stdout(GATEWAY_TEST_USAGE)
    return 0
  }

  const method = parsed.positionals[0] ?? 'mock'
  if (parsed.positionals.length > 1) {
    ctx.stderr('npay: unexpected extra arguments')
    return 2
  }
  if (!isGatewayMethod(method)) {
    ctx.stderr(`npay: unknown gateway: ${method}`)
    ctx.stderr(GATEWAY_TEST_USAGE)
    return 2
  }

  const options: GatewayTestOptions = {
    orderId: parsed.values['order-id'] ?? DEFAULT_ORDER_ID,
    amount: parsed.values.amount ?? DEFAULT_AMOUNT,
  }

  ctx.stdout(`npay gateway test ${method}`)
  ctx.stdout('')
  try {
    return method === 'mock'
      ? await runMock(ctx, options)
      : await runReal(method, ctx, options)
  } catch (error) {
    ctx.stderr(
      `FAIL (${method}): ${error instanceof Error ? error.message : String(error)}`
    )
    return 1
  }
}
