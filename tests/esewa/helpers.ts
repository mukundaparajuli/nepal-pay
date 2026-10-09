import { createOrder, moneyFromDecimal, type Order } from '@nepal-payments/core'
import {
  createEsewa,
  signFields,
  type EsewaConfig,
  type EsewaGateway,
} from '@nepal-payments/esewa'

export const SANDBOX_SECRET = '8gBm/:&EnhH.1/q'
export const SANDBOX_PRODUCT_CODE = 'EPAYTEST'

export const CHECKOUT_SFN = 'total_amount,transaction_uuid,product_code'
export const CALLBACK_SFN =
  'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names'

export function b64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64')
}

export function b64url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url')
}

export interface CallbackInput {
  status: string
  signature?: string
  transaction_code?: string
  total_amount: string | number
  transaction_uuid: string
  product_code: string
  success_url?: string
  signed_field_names: string
}

function literal(value: string | number): string {
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
    return value
  }
  return JSON.stringify(value)
}

export async function signCallbackPayload(
  input: CallbackInput,
  secret: string = SANDBOX_SECRET
): Promise<CallbackInput> {
  const values: Record<string, string> = {}
  for (const name of input.signed_field_names.split(',')) {
    const trimmed = name.trim()
    if (trimmed === 'signed_field_names') {
      values[trimmed] = input.signed_field_names
      continue
    }
    const raw = (input as unknown as Record<string, unknown>)[trimmed]
    if (raw === undefined)
      throw new Error(`missing field for signing: ${trimmed}`)
    values[trimmed] = String(raw)
  }
  const signature = await signFields(values, input.signed_field_names, secret)
  return { ...input, signature }
}

export function serializeCallback(input: CallbackInput): string {
  const entries = Object.entries(input).map(
    ([key, value]) =>
      `${JSON.stringify(key)}:${literal(value as string | number)}`
  )
  return `{${entries.join(',')}}`
}

export function callbackData(input: CallbackInput): string {
  return b64(serializeCallback(input))
}

export async function makeCompleteCallback(
  overrides: Partial<CallbackInput> = {},
  secret: string = SANDBOX_SECRET
): Promise<{ input: CallbackInput; data: string; json: string }> {
  const input: CallbackInput = {
    status: 'COMPLETE',
    transaction_code: '0004T5I',
    total_amount: '230.00',
    transaction_uuid: 'ORD001',
    product_code: SANDBOX_PRODUCT_CODE,
    signed_field_names: CALLBACK_SFN,
    ...overrides,
  }
  const signed = await signCallbackPayload(input, secret)
  return {
    input: signed,
    data: callbackData(signed),
    json: serializeCallback(signed),
  }
}

export function order(overrides: Partial<Order> = {}): Order {
  return createOrder({
    id: 'ORD001',
    amount: moneyFromDecimal('230.00'),
    ...overrides,
  })
}

export function testGateway(
  overrides: Partial<EsewaConfig> = {}
): EsewaGateway {
  return createEsewa({
    merchantCode: SANDBOX_PRODUCT_CODE,
    secret: SANDBOX_SECRET,
    environment: 'sandbox',
    successUrl: 'https://merchant.example/success',
    failureUrl: 'https://merchant.example/failure',
    ...overrides,
  })
}

export interface StubResult {
  readonly status?: number
  readonly body?: unknown
  readonly jsonThrows?: boolean
}

export function stubFetch(
  handler: (url: string) => StubResult | Promise<StubResult>
): { fetch: typeof globalThis.fetch; calls: string[] } {
  const calls: string[] = []
  const fetchImpl = (async (input: unknown): Promise<Response> => {
    const url = String(input)
    calls.push(url)
    const result = await handler(url)
    const status = result.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (result.jsonThrows) throw new Error('invalid json')
        return result.body
      },
    } as unknown as Response
  }) as unknown as typeof globalThis.fetch
  return { fetch: fetchImpl, calls }
}

export function fetchReturning(body: unknown): typeof globalThis.fetch {
  return stubFetch(() => ({ body })).fetch
}

export function rejectingFetch(
  message = 'network disabled'
): typeof globalThis.fetch {
  return (() =>
    Promise.reject(new Error(message))) as unknown as typeof globalThis.fetch
}

export const SERVER_COMPLETE = {
  product_code: SANDBOX_PRODUCT_CODE,
  transaction_uuid: 'ORD001',
  total_amount: 230,
  status: 'COMPLETE',
  ref_id: '0004T5I',
}

export async function captureError(
  fn: () => unknown | Promise<unknown>
): Promise<unknown> {
  try {
    await fn()
    return undefined
  } catch (error) {
    return error
  }
}
