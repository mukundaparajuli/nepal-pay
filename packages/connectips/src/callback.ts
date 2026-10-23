import {
  PaymentError,
  type RawCallbackRequest,
  type UnverifiedCallback,
} from '@nepal-pay/core'
import type { ConnectIpsCallbackPayload } from './types.js'
import { isValidTxnId } from './validation.js'

function readFromBody(body: unknown): string | undefined {
  if (typeof body === 'string') {
    const params = new URLSearchParams(body)
    const value = params.get('TXNID')
    return value ?? undefined
  }
  if (typeof body === 'object' && body !== null) {
    const value = (body as Record<string, unknown>).TXNID
    return typeof value === 'string' ? value : undefined
  }
  return undefined
}

/**
 * Parse a connectIPS redirect callback. connectIPS appends only `?TXNID=` to
 * the registered success/failure URL; authenticity comes from the
 * server-to-server `validatetxn` call, not from the callback itself.
 */
export function parseConnectIpsCallback(
  request: RawCallbackRequest
): UnverifiedCallback {
  const queryValue = request.query?.TXNID
  const query =
    typeof queryValue === 'string' && queryValue.length > 0
      ? queryValue
      : undefined
  const txnId = query ?? readFromBody(request.body)

  if (txnId === undefined || txnId.length === 0) {
    throw new PaymentError(
      'connectIPS callback is missing the TXNID parameter',
      'MALFORMED_CALLBACK'
    )
  }
  if (!isValidTxnId(txnId)) {
    throw new PaymentError(
      'connectIPS callback TXNID is malformed',
      'MALFORMED_CALLBACK'
    )
  }

  const payload: ConnectIpsCallbackPayload = { TXNID: txnId }
  return {
    gateway: 'connectips',
    data: payload,
    body: request.body,
    headers: request.headers,
  }
}
