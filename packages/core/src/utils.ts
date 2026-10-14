import { PaymentError } from './errors.js'

const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

function utf8Bytes(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(utf8Encoder.encode(value))
}

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

export function base64EncodeBytes(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
}

export function base64DecodeBytes(encoded: string): Uint8Array {
  let binary: string
  try {
    binary = atob(encoded)
  } catch {
    throw new PaymentError('Invalid base64 input', 'INVALID_BASE64')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function constantTimeCompare(a: string, b: string): boolean {
  const bytesA = utf8Bytes(a)
  const bytesB = utf8Bytes(b)
  const length = Math.max(bytesA.length, bytesB.length)
  let diff = bytesA.length ^ bytesB.length
  for (let i = 0; i < length; i++) {
    diff |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0)
  }
  return diff === 0
}

export async function sha256(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', utf8Bytes(data))
  return toHex(new Uint8Array(digest))
}

export async function hmacSha256(
  data: string,
  secret: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    utf8Bytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, utf8Bytes(data))
  return toHex(new Uint8Array(signature))
}

export async function verifySha256(
  data: string,
  expectedHash: string
): Promise<boolean> {
  const actual = await sha256(data)
  return constantTimeCompare(actual, expectedHash.toLowerCase())
}

export async function verifyHmacSha256(
  data: string,
  secret: string,
  expectedSignature: string
): Promise<boolean> {
  const actual = await hmacSha256(data, secret)
  return constantTimeCompare(actual, expectedSignature.toLowerCase())
}

export async function hmacSha512(
  data: string,
  secret: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    utf8Bytes(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, utf8Bytes(data))
  return toHex(new Uint8Array(signature))
}

export async function verifyHmacSha512(
  data: string,
  secret: string,
  expectedSignature: string
): Promise<boolean> {
  const actual = await hmacSha512(data, secret)
  return constantTimeCompare(actual, expectedSignature.toLowerCase())
}

export function safeBase64Encode(data: string): string {
  return bytesToBase64(utf8Bytes(data))
}

export function safeBase64Decode(encoded: string): string {
  if (!BASE64_PATTERN.test(encoded) || encoded.length % 4 !== 0) {
    throw new PaymentError('Invalid base64 input', 'INVALID_BASE64')
  }
  let binary: string
  try {
    binary = atob(encoded)
  } catch {
    throw new PaymentError('Invalid base64 input', 'INVALID_BASE64')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  if (bytesToBase64(bytes) !== encoded) {
    throw new PaymentError('Non-canonical base64 input', 'INVALID_BASE64')
  }
  try {
    return utf8Decoder.decode(bytes)
  } catch {
    throw new PaymentError(
      'Base64 payload is not valid UTF-8',
      'INVALID_BASE64'
    )
  }
}

export function isValidOrderId(orderId: string): boolean {
  return (
    typeof orderId === 'string' && orderId.length > 0 && orderId.length <= 100
  )
}
