import { createOrder, moneyFromDecimal, type Order } from '@nepal-pay/core'
import {
  createKhalti,
  type KhaltiConfig,
  type KhaltiGateway,
} from '@nepal-pay/khalti'

export const SANDBOX_SECRET = 'sk_test_0123456789abcdef0123456789abcdef'
export const SANDBOX_INITIATE_URL =
  'https://dev.khalti.com/api/v2/epayment/initiate/'
export const SANDBOX_LOOKUP_URL =
  'https://dev.khalti.com/api/v2/epayment/lookup/'
export const PROD_INITIATE_URL = 'https://khalti.com/api/v2/epayment/initiate/'
export const PROD_LOOKUP_URL = 'https://khalti.com/api/v2/epayment/lookup/'

export function order(overrides: Partial<Order> = {}): Order {
  return createOrder({
    id: 'ORD001',
    amount: moneyFromDecimal('230.00'),
    ...overrides,
  })
}

export function testGateway(
  overrides: Partial<KhaltiConfig> = {}
): KhaltiGateway {
  return createKhalti({
    secretKey: SANDBOX_SECRET,
    environment: 'sandbox',
    returnUrl: 'https://merchant.example/callback',
    websiteUrl: 'https://merchant.example',
    ...overrides,
  })
}

export function makeQueryCallback(query: Record<string, unknown>): {
  gateway: 'khalti'
  data: Record<string, unknown>
} {
  return { gateway: 'khalti', data: query }
}

export const COMPLETED_PIDX = 'HT6o6PEZRWFJ5ygavzHWd5'
export const COMPLETED_TXN = 'GFq9PFS7b2iYvL8Lir9oXe'

export interface StubResult {
  readonly status?: number
  readonly body?: unknown
  readonly text?: string
}

export interface StubCall {
  readonly url: string
  readonly init?: RequestInit
  readonly body?: unknown
}

export function stubRequest(
  handler: (url: string, init?: RequestInit) => StubResult | Promise<StubResult>
): {
  fetch: typeof globalThis.fetch
  calls: StubCall[]
} {
  const calls: StubCall[] = []
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = String(input)
    const bodyRaw = typeof init?.body === 'string' ? init.body : undefined
    let body: unknown = bodyRaw
    if (bodyRaw !== undefined) {
      try {
        body = JSON.parse(bodyRaw)
      } catch {
        body = bodyRaw
      }
    }
    calls.push({ url, init, body })
    const result = await handler(url, init)
    const status = result.status ?? 200
    const bodyText =
      result.text ??
      (typeof result.body === 'string'
        ? result.body
        : JSON.stringify(result.body))
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => bodyText,
      json: async () => JSON.parse(bodyText),
    } as unknown as Response
  }) as unknown as typeof globalThis.fetch
  return { fetch: fetchImpl, calls }
}

export function fetchReturning(body: unknown): typeof globalThis.fetch {
  return stubRequest(() => ({ body })).fetch
}

export function hangingFetch(): typeof globalThis.fetch {
  return (async (_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted', 'AbortError'))
      })
    })) as unknown as typeof globalThis.fetch
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
