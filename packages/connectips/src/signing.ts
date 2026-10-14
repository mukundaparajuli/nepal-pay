import {
  rsaSha256Sign,
  rsaSha256Verify,
  type RsaPrivateKey,
  type RsaPublicKey,
} from '@nepal-payments/core'
import { CHECKOUT_TOKEN_FIELDS } from './constants.js'

export interface ConnectIpsValidationTokenInput {
  readonly merchantId: string
  readonly appId: string
  readonly referenceId: string
  readonly txnAmt: string
}

/**
 * Build the checkout token message. NCHL specifies the exact field order and a
 * trailing literal `TOKEN=TOKEN` (the signature is not part of the message).
 */
export function buildCheckoutTokenMessage(
  values: Readonly<Record<string, string>>
): string {
  const parts = CHECKOUT_TOKEN_FIELDS.map(
    (field) => `${field}=${values[field] ?? ''}`
  )
  return [...parts, 'TOKEN=TOKEN'].join(',')
}

/** Build the validatetxn / gettxndetail token message. */
export function buildValidationTokenMessage(
  input: ConnectIpsValidationTokenInput
): string {
  return [
    `MERCHANTID=${input.merchantId}`,
    `APPID=${input.appId}`,
    `REFERENCEID=${input.referenceId}`,
    `TXNAMT=${input.txnAmt}`,
  ].join(',')
}

export function signConnectIpsToken(
  message: string,
  key: RsaPrivateKey
): Promise<string> {
  return rsaSha256Sign(message, key)
}

/** Verify a connectIPS token with the merchant public key (used in tests). */
export function verifyConnectIpsToken(
  message: string,
  signature: string,
  key: RsaPublicKey
): Promise<boolean> {
  return rsaSha256Verify(message, signature, key)
}
