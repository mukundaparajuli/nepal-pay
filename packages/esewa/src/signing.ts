import { hmacSha256, constantTimeCompare } from '@nepal-pay/core'

export function buildSignatureMessage(
  values: Readonly<Record<string, string>>,
  signedFieldNames: string
): string {
  const names = signedFieldNames.split(',').map((name) => name.trim())
  if (names.length === 0 || names.some((name) => name.length === 0)) {
    throw new Error('signed_field_names must list at least one field')
  }
  for (const name of names) {
    if (!(name in values)) {
      throw new Error(`Signed field "${name}" is missing from the payload`)
    }
  }
  return names.map((name) => `${name}=${values[name]}`).join(',')
}

export async function signFields(
  values: Readonly<Record<string, string>>,
  signedFieldNames: string,
  secret: string
): Promise<string> {
  const message = buildSignatureMessage(values, signedFieldNames)
  const digest = await hmacSha256(message, secret)
  return hexToBase64(digest)
}

export async function verifySignedFields(
  values: Readonly<Record<string, string>>,
  signedFieldNames: string,
  secret: string,
  signature: string
): Promise<boolean> {
  const expected = await signFields(values, signedFieldNames, secret)
  const expectedBytes = base64ToBinary(expected)
  const receivedBytes = base64ToBinary(signature)
  return constantTimeCompare(expectedBytes, receivedBytes)
}

function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBinary(value: string): string {
  try {
    return atob(normalizeBase64(value))
  } catch {
    return ''
  }
}

function normalizeBase64(value: string): string {
  const converted = value.trim().replace(/-/g, '+').replace(/_/g, '/')
  const padding = (4 - (converted.length % 4)) % 4
  return converted + '='.repeat(padding)
}

export function decodeRawJsonTokens(text: string): Record<string, string> {
  const tokens: Record<string, string> = {}
  const pattern =
    /"([^"]+)"\s*:\s*("(?:\\.|[^"\\])*"|[\d.eE+-]+|true|false|null)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1]
    const raw = match[2]
    if (name === undefined || raw === undefined) continue
    tokens[name] = raw.startsWith('"') ? unescapeJsonString(raw) : raw
  }
  return tokens
}

function unescapeJsonString(raw: string): string {
  return raw
    .slice(1, -1)
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\\//g, '/')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
}
