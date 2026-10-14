import { base64EncodeBytes, VerificationError } from '@nepal-payments/core'
import type {
  ConnectIpsApiResponse,
  ResolvedConnectIpsConfig,
} from './types.js'

const utf8Encoder = new TextEncoder()

export interface ConnectIpsApiBody {
  readonly merchantId: string
  readonly appId: string
  readonly referenceId: string
  readonly txnAmt: string
  readonly token: string
}

function basicAuth(user: string, password: string): string {
  return base64EncodeBytes(utf8Encoder.encode(`${user}:${password}`))
}

/**
 * POST a signed JSON request to a connectIPS server-to-server endpoint.
 *
 * Authenticates with HTTP Basic (app id + password). NCHL returns HTTP 200
 * with a `status` field (`SUCCESS` / `FAILED` / `ERROR`) for known
 * transactions; transport-level failures raise `INVALID_STATUS`.
 */
export async function postConnectIpsJson(
  config: ResolvedConnectIpsConfig,
  url: string,
  body: ConnectIpsApiBody
): Promise<ConnectIpsApiResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  let response: Response
  try {
    response = await config.fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Basic ${basicAuth(config.appId, config.password)}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
  } finally {
    clearTimeout(timer)
  }

  let text: string
  try {
    text = await response.text()
  } catch {
    throw new VerificationError(
      `connectIPS request returned no readable body (HTTP ${response.status})`,
      'INVALID_STATUS'
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new VerificationError(
      `connectIPS returned malformed JSON (HTTP ${response.status})`,
      'INVALID_STATUS'
    )
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new VerificationError(
      'connectIPS returned a malformed payload',
      'INVALID_STATUS'
    )
  }
  const record = parsed as Record<string, unknown>
  if (typeof record.status !== 'string') {
    throw new VerificationError(
      `connectIPS returned an unexpected response (HTTP ${response.status})`,
      'INVALID_STATUS'
    )
  }
  return record as unknown as ConnectIpsApiResponse
}
