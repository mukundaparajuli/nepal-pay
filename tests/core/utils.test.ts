import { describe, it, expect } from 'vitest'
import {
  constantTimeCompare,
  sha256,
  hmacSha256,
  hmacSha512,
  verifySha256,
  verifyHmacSha256,
  verifyHmacSha512,
  safeBase64Encode,
  safeBase64Decode,
  base64EncodeBytes,
  base64DecodeBytes,
  isValidOrderId,
  PaymentError,
} from '@nepal-payments/core'

describe('sha256', () => {
  it('matches the known empty-string digest', async () => {
    expect(await sha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })

  it('matches the known abc digest', async () => {
    expect(await sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })
})

describe('hmacSha256', () => {
  it('matches the known RFC test vector', async () => {
    expect(
      await hmacSha256('The quick brown fox jumps over the lazy dog', 'key')
    ).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')
  })
})

describe('verifySha256', () => {
  const digest =
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

  it('accepts a correct hash', async () => {
    expect(await verifySha256('abc', digest)).toBe(true)
  })

  it('accepts uppercase hex', async () => {
    expect(await verifySha256('abc', digest.toUpperCase())).toBe(true)
  })

  it('rejects a wrong or empty hash', async () => {
    expect(await verifySha256('abc', 'deadbeef')).toBe(false)
    expect(await verifySha256('abc', '')).toBe(false)
    expect(await verifySha256('abd', digest)).toBe(false)
  })
})

describe('verifyHmacSha256', () => {
  it('accepts a correct signature', async () => {
    const signature = await hmacSha256('payload', 'secret')
    expect(await verifyHmacSha256('payload', 'secret', signature)).toBe(true)
    expect(
      await verifyHmacSha256('payload', 'secret', signature.toUpperCase())
    ).toBe(true)
  })

  it('rejects tampered payloads, secrets, and signatures', async () => {
    const signature = await hmacSha256('payload', 'secret')
    expect(await verifyHmacSha256('tampered', 'secret', signature)).toBe(false)
    expect(await verifyHmacSha256('payload', 'other', signature)).toBe(false)
    expect(await verifyHmacSha256('payload', 'secret', 'ff'.repeat(32))).toBe(
      false
    )
    expect(await verifyHmacSha256('payload', 'secret', '')).toBe(false)
  })
})

describe('hmacSha512', () => {
  it('matches RFC 4231 test case 1', async () => {
    expect(await hmacSha512('Hi There', '\x0b'.repeat(20))).toBe(
      '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854'
    )
  })

  it('matches RFC 4231 test case 2', async () => {
    expect(
      await hmacSha512('what do ya want for nothing?', 'Jefe')
    ).toBe(
      '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737'
    )
  })
})

describe('verifyHmacSha512', () => {
  it('accepts a correct signature regardless of case', async () => {
    const signature = await hmacSha512('payload', 'secret')
    expect(await verifyHmacSha512('payload', 'secret', signature)).toBe(true)
    expect(
      await verifyHmacSha512('payload', 'secret', signature.toUpperCase())
    ).toBe(true)
  })

  it('rejects tampered payloads, secrets, and signatures', async () => {
    const signature = await hmacSha512('payload', 'secret')
    expect(await verifyHmacSha512('tampered', 'secret', signature)).toBe(false)
    expect(await verifyHmacSha512('payload', 'other', signature)).toBe(false)
    expect(await verifyHmacSha512('payload', 'secret', 'deadbeef')).toBe(false)
    expect(await verifyHmacSha512('payload', 'secret', '')).toBe(false)
  })
})

describe('binary base64 helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255])
    const encoded = base64EncodeBytes(bytes)
    expect(base64DecodeBytes(encoded)).toEqual(bytes)
  })

  it('throws INVALID_BASE64 on malformed input', () => {
    expect(() => base64DecodeBytes('!!!!')).toThrow(PaymentError)
  })
})

describe('constantTimeCompare', () => {
  it('compares equal and unequal strings', () => {
    expect(constantTimeCompare('abc', 'abc')).toBe(true)
    expect(constantTimeCompare('abc', 'abd')).toBe(false)
    expect(constantTimeCompare('abc', 'ab')).toBe(false)
    expect(constantTimeCompare('', '')).toBe(true)
    expect(constantTimeCompare('a', '')).toBe(false)
  })

  it('compares multi-byte text by bytes', () => {
    expect(constantTimeCompare('नेपाल', 'नेपाल')).toBe(true)
    expect(constantTimeCompare('नेपाल', 'नेपल')).toBe(false)
  })
})

describe('strict base64 helpers', () => {
  it('round-trips unicode text', () => {
    const text = 'नेपाल payments ✓'
    expect(safeBase64Decode(safeBase64Encode(text))).toBe(text)
    expect(safeBase64Encode('a')).toBe('YQ==')
  })

  it('rejects malformed base64', () => {
    expect(() => safeBase64Decode('!!!!')).toThrow(PaymentError)
    expect(() => safeBase64Decode('abc')).toThrow(PaymentError)
    expect(() => safeBase64Decode('AA=A')).toThrow(PaymentError)
    expect(() => safeBase64Decode('====')).toThrow(PaymentError)
    expect(() => safeBase64Decode('AA==AA==')).toThrow(PaymentError)
  })

  it('rejects non-canonical base64', () => {
    expect(() => safeBase64Decode('AB==')).toThrow(PaymentError)
  })

  it('rejects payloads that are not valid UTF-8', () => {
    expect(() => safeBase64Decode(btoa('\xff\xfe'))).toThrow(PaymentError)
  })

  it('reports the INVALID_BASE64 code', () => {
    try {
      safeBase64Decode('!')
      expect.unreachable('expected a PaymentError')
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentError)
      expect((error as PaymentError).code).toBe('INVALID_BASE64')
    }
  })
})

describe('isValidOrderId', () => {
  it('accepts ids between 1 and 100 characters', () => {
    expect(isValidOrderId('ORD1')).toBe(true)
    expect(isValidOrderId('x'.repeat(100))).toBe(true)
  })

  it('rejects empty and overlong ids', () => {
    expect(isValidOrderId('')).toBe(false)
    expect(isValidOrderId('x'.repeat(101))).toBe(false)
  })
})
