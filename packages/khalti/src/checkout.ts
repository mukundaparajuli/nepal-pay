import { PaymentError, type Order } from '@nepal-payments/core'
import type {
  KhaltiCheckoutOptions,
  KhaltiInitiateRequest,
  KhaltiInitiateResponse,
  ResolvedKhaltiConfig,
} from './types.js'
import { MIN_AMOUNT_PAISA } from './constants.js'

export interface KhaltiCheckout {
  readonly checkout: {
    readonly type: 'redirect'
    readonly url: string
  }
  readonly pidx: string
  readonly expiresAt?: string
  readonly expiresIn?: number
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function orderAmountToPaisa(order: Order): bigint {
  if (order.amount.precision > 2) {
    throw new PaymentError(
      'Khalti amounts must have at most 2 decimal places',
      'INVALID_AMOUNT'
    )
  }
  const scale = 10n ** BigInt(2 - order.amount.precision)
  return order.amount.amount * scale
}

export async function buildKhaltiCheckout(
  config: ResolvedKhaltiConfig,
  order: Order,
  options?: KhaltiCheckoutOptions
): Promise<KhaltiCheckout> {
  if (!(order.id.length > 0)) {
    throw new PaymentError(
      'Khalti checkout requires a non-empty purchase_order_id',
      'INVALID_ORDER_ID'
    )
  }

  const paisa = orderAmountToPaisa(order)
  if (paisa < MIN_AMOUNT_PAISA) {
    throw new PaymentError(
      'Khalti amount must be at least Rs. 10 (1000 paisa)',
      'INVALID_AMOUNT'
    )
  }
  if (paisa > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PaymentError(
      'Khalti amount exceeds the safe integer range',
      'UNSAFE_AMOUNT'
    )
  }

  const returnUrl = options?.returnUrl ?? config.returnUrl ?? order.returnUrl
  if (returnUrl === undefined) {
    throw new PaymentError(
      'Khalti checkout requires a return_url (config.returnUrl or order.returnUrl)',
      'INVALID_URL'
    )
  }
  if (!isHttpUrl(returnUrl)) {
    throw new PaymentError(
      `Invalid Khalti return_url: ${String(returnUrl)}`,
      'INVALID_URL'
    )
  }

  let websiteUrl = options?.websiteUrl ?? config.websiteUrl
  if (websiteUrl === undefined) {
    websiteUrl = new URL(returnUrl).origin
  }
  if (!isHttpUrl(websiteUrl)) {
    throw new PaymentError(
      `Invalid Khalti website_url: ${String(websiteUrl)}`,
      'INVALID_URL'
    )
  }

  const purchaseOrderName =
    options?.purchaseOrderName ??
    order.productName ??
    order.description ??
    order.id

  const customerInfo: { name?: string; email?: string; phone?: string } = {}
  if (order.customerName !== undefined) customerInfo.name = order.customerName
  if (order.customerEmail !== undefined)
    customerInfo.email = order.customerEmail
  if (order.customerPhone !== undefined)
    customerInfo.phone = order.customerPhone

  const initiateRequest: KhaltiInitiateRequest = {
    return_url: returnUrl,
    website_url: websiteUrl,
    amount: Number(paisa),
    purchase_order_id: order.id,
    purchase_order_name: purchaseOrderName,
  }
  if (Object.keys(customerInfo).length > 0) {
    Object.assign(initiateRequest, { customer_info: customerInfo })
  }

  const result = await postInitiate(config, initiateRequest)
  return {
    checkout: {
      type: 'redirect',
      url: result.payment_url,
    },
    pidx: result.pidx,
    expiresAt: result.expires_at,
    expiresIn: result.expires_in,
  }
}

export async function postInitiate(
  config: ResolvedKhaltiConfig,
  request: KhaltiInitiateRequest
): Promise<KhaltiInitiateResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  let response: Response
  try {
    response = await config.fetch(config.initiateUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Key ${config.secretKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(request),
    })
  } finally {
    clearTimeout(timer)
  }

  let bodyText: string
  try {
    bodyText = await response.text()
  } catch {
    throw new PaymentError('Khalti initiate returned no readable body')
  }

  if (!response.ok) {
    const detail = extractErrorMessage(bodyText)
    throw new PaymentError(
      detail !== undefined
        ? `Khalti initiate failed with HTTP ${response.status}: ${detail}`
        : `Khalti initiate failed with HTTP ${response.status}`,
      'INVALID_STATUS'
    )
  }

  let body: unknown
  try {
    body = JSON.parse(bodyText)
  } catch {
    throw new PaymentError(
      'Khalti initiate returned malformed JSON',
      'INVALID_STATUS'
    )
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new PaymentError(
      'Khalti initiate returned a malformed payload',
      'INVALID_STATUS'
    )
  }
  const record = body as Record<string, unknown>
  if (
    typeof record.pidx !== 'string' ||
    record.pidx.length === 0 ||
    typeof record.payment_url !== 'string' ||
    record.payment_url.length === 0
  ) {
    throw new PaymentError(
      'Khalti initiate response is missing pidx or payment_url',
      'INVALID_STATUS'
    )
  }
  if (!isHttpUrl(record.payment_url)) {
    throw new PaymentError(
      `Khalti initiate returned an invalid payment_url: ${String(
        record.payment_url
      )}`,
      'INVALID_STATUS'
    )
  }

  return {
    pidx: record.pidx,
    payment_url: record.payment_url,
    expires_at:
      typeof record.expires_at === 'string' ? record.expires_at : undefined,
    expires_in:
      typeof record.expires_in === 'number' ? record.expires_in : undefined,
  }
}

function extractErrorMessage(bodyText: string): string | undefined {
  try {
    const body: unknown = JSON.parse(bodyText)
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>
      if (typeof record.detail === 'string' && record.detail.length > 0) {
        return record.detail
      }
      if (typeof record.error_key === 'string' && record.error_key.length > 0) {
        return record.error_key
      }
    }
  } catch {
    return undefined
  }
  return undefined
}
