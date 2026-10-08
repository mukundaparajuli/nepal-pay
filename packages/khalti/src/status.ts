import {
  createMoney,
  VerificationError,
  type Money,
  type PaymentStatus,
} from '@nepal-payments/core'
import type { ResolvedKhaltiConfig } from './types.js'
import type { KhaltiLookupResponse } from './types.js'

const STATUS_MAP: Readonly<Record<string, PaymentStatus>> = {
  completed: 'completed',
  pending: 'pending',
  initiated: 'pending',
  'user canceled': 'canceled',
  expired: 'expired',
  refunded: 'unknown',
  'partially refunded': 'unknown',
}

export function mapKhaltiStatus(status: unknown): PaymentStatus {
  if (typeof status !== 'string') return 'unknown'
  const normalized = status.trim().toLowerCase()
  return STATUS_MAP[normalized] ?? 'unknown'
}

export function khaltiPaisaToMoney(value: unknown): Money {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new VerificationError(
        `Khalti amount exceeds the safe range: ${String(value)}`,
        'UNSAFE_AMOUNT'
      )
    }
    return createMoney(BigInt(value), 'NPR', 2)
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return createMoney(value.trim(), 'NPR', 2)
  }
  throw new VerificationError(
    `Invalid Khalti amount: ${String(value)}`,
    'INVALID_AMOUNT'
  )
}

export function isPaisaAmount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value <= Number.MAX_SAFE_INTEGER
  )
}

export async function queryLookup(
  config: ResolvedKhaltiConfig,
  pidx: string
): Promise<KhaltiLookupResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  let response: Response
  try {
    response = await config.fetch(config.lookupUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Key ${config.secretKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ pidx }),
    })
  } finally {
    clearTimeout(timer)
  }

  let bodyText: string
  try {
    bodyText = await response.text()
  } catch {
    throw new VerificationError('Khalti lookup returned no readable body')
  }
  let body: unknown
  try {
    body = JSON.parse(bodyText)
  } catch {
    throw new VerificationError(
      `Khalti lookup returned malformed JSON (HTTP ${response.status})`,
      'INVALID_STATUS'
    )
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new VerificationError('Khalti lookup returned a malformed payload')
  }
  const record = body as Record<string, unknown>

  if (typeof record.pidx === 'string' && typeof record.status === 'string') {
    return normalizeLookup(record)
  }
  if (typeof record.detail === 'string') {
    if (record.detail.toLowerCase().includes('not found')) {
      throw new VerificationError(
        `Khalti has no record for pidx ${pidx}`,
        'UNKNOWN_TRANSACTION'
      )
    }
    if (!response.ok) {
      throw new VerificationError(
        `Khalti lookup failed with HTTP ${response.status}: ${record.detail}`,
        'INVALID_STATUS'
      )
    }
    throw new VerificationError(
      `Khalti lookup failed: ${record.detail}`,
      'INVALID_STATUS'
    )
  }
  throw new VerificationError(
    `Khalti lookup failed with HTTP ${response.status}`,
    'INVALID_STATUS'
  )
}

function normalizeLookup(
  record: Record<string, unknown>
): KhaltiLookupResponse {
  const pidx = record.pidx as string
  const status = record.status as string
  const transactionId = record.transaction_id
  const fee = record.fee
  const refunded = record.refunded
  const purchaseOrderId = record.purchase_order_id
  const totalAmount = record.total_amount
  let totalAmountNumber: number
  if (isPaisaAmount(totalAmount)) {
    totalAmountNumber = totalAmount
  } else if (
    typeof totalAmount === 'string' &&
    /^-?\d+$/.test(totalAmount.trim())
  ) {
    const parsed = Number(totalAmount)
    if (!Number.isSafeInteger(parsed)) {
      throw new VerificationError(
        'Khalti lookup total_amount exceeds the safe range',
        'UNSAFE_AMOUNT'
      )
    }
    totalAmountNumber = parsed
  } else {
    throw new VerificationError(
      'Khalti lookup response has an invalid total_amount',
      'INVALID_AMOUNT'
    )
  }

  return {
    pidx,
    status,
    total_amount: totalAmountNumber,
    transaction_id: typeof transactionId === 'string' ? transactionId : null,
    fee: typeof fee === 'number' ? fee : null,
    refunded: refunded === true,
    ...(typeof purchaseOrderId === 'string'
      ? { purchase_order_id: purchaseOrderId }
      : {}),
  }
}
