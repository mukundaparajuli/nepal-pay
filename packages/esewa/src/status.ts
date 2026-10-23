import {
  moneyFromDecimal,
  VerificationError,
  type Money,
  type PaymentStatus,
} from '@nepal-pay/core'
import type { ResolvedEsewaConfig } from './types.js'

const STATUS_MAP: Readonly<Record<string, PaymentStatus>> = {
  COMPLETE: 'completed',
  PENDING: 'pending',
  CANCELED: 'canceled',
  NOT_FOUND: 'unknown',
  FULL_REFUND: 'unknown',
  PARTIAL_REFUND: 'unknown',
}

export function mapEsewaStatus(status: unknown): PaymentStatus {
  if (typeof status !== 'string') return 'unknown'
  return STATUS_MAP[status] ?? 'unknown'
}

export function esewaMoneyFromAmount(value: unknown): Money {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new VerificationError(
      `Invalid eSewa amount: ${String(value)}`,
      'INVALID_AMOUNT'
    )
  }
  return moneyFromDecimal(String(value))
}

export interface EsewaStatusResponse {
  readonly product_code: string
  readonly transaction_uuid: string
  readonly total_amount: number
  readonly status: string
  readonly ref_id: string | null
}

export async function queryStatus(
  config: ResolvedEsewaConfig,
  productCode: string,
  totalAmount: string,
  transactionUuid: string
): Promise<EsewaStatusResponse> {
  const params = new URLSearchParams({
    product_code: productCode,
    total_amount: totalAmount,
    transaction_uuid: transactionUuid,
  })
  const url = `${config.statusCheckUrl}?${params.toString()}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  let response: Response
  try {
    response = await config.fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) {
    throw new VerificationError(
      `eSewa status check failed with HTTP ${response.status}`,
      'INVALID_STATUS'
    )
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new VerificationError('eSewa status check returned malformed JSON')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new VerificationError(
      'eSewa status check returned a malformed payload',
      'INVALID_STATUS'
    )
  }
  const candidate = body as Record<string, unknown>
  if (
    typeof candidate.product_code !== 'string' ||
    typeof candidate.transaction_uuid !== 'string' ||
    typeof candidate.status !== 'string'
  ) {
    throw new VerificationError(
      'eSewa status check returned a malformed payload',
      'INVALID_STATUS'
    )
  }
  const amount = candidate.total_amount
  const refId = candidate.ref_id ?? null
  return {
    product_code: candidate.product_code,
    transaction_uuid: candidate.transaction_uuid,
    total_amount:
      typeof amount === 'number' ? amount : Number.parseFloat(String(amount)),
    status: candidate.status,
    ref_id: typeof refId === 'string' ? refId : null,
  }
}
