import { hmacSha256, verifyHmacSha256 } from '@nepal-pay/core'

export function buildMockSignatureMessage(values: {
  readonly txn_id: string
  readonly order_id: string
  readonly amount: string
  readonly status: string
}): string {
  return [
    `txn_id=${values.txn_id}`,
    `order_id=${values.order_id}`,
    `amount=${values.amount}`,
    `status=${values.status}`,
  ].join(',')
}

export async function signMockCallback(
  values: {
    readonly txn_id: string
    readonly order_id: string
    readonly amount: string
    readonly status: string
  },
  secret: string
): Promise<string> {
  return hmacSha256(buildMockSignatureMessage(values), secret)
}

export async function verifyMockSignature(
  values: {
    readonly txn_id: string
    readonly order_id: string
    readonly amount: string
    readonly status: string
  },
  secret: string,
  signature: string
): Promise<boolean> {
  return verifyHmacSha256(buildMockSignatureMessage(values), secret, signature)
}
