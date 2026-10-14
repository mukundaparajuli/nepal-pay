import { describe, it, expect } from 'vitest'
import {
  buildRequestMessage,
  buildResponseMessage,
  generateFonepayDv,
  verifyFonepayDv,
} from '@nepal-payments/fonepay'
import { FONEPAY_SECRET } from './helpers.js'

const REQUEST_VALUES = {
  PID: '1234567890',
  MD: 'P',
  PRN: 'ORD-123',
  AMT: '230.00',
  CRN: 'NPR',
  DT: '03/15/2022',
  R1: 'Order ORD-123',
  R2: 'N/A',
  RU: 'https://merchant.example/callback',
}

const RESPONSE_VALUES = {
  PRN: 'ORD-123',
  PID: '1234567890',
  PS: 'true',
  RC: 'successful',
  UID: 'FP-UID-12345',
  BC: 'GBIME',
  INI: '9800000001',
  P_AMT: '230.00',
  R_AMT: '0.00',
}

const REQUEST_DV =
  '60FA8109A20021A054E79804967053DD811357EC8D144E72CCDC36923D4B48E3D2650F57622350F255F3DF6578380A888B49DA534EF0E61C18245D0D4077436B'

const RESPONSE_DV =
  'A885A75DE8B1DB99C5EF068B69482429B3B6D6FF0D5C7F4CF4FF9DA178456F1A3AD005F61F49658334BF4F7D86B4B6C1483BEFC06F1BD0B183474A2EBDD30F31'

describe('fonepay signing', () => {
  it('joins request values with commas in the documented order', () => {
    expect(buildRequestMessage(REQUEST_VALUES)).toBe(
      '1234567890,P,ORD-123,230.00,NPR,03/15/2022,Order ORD-123,N/A,https://merchant.example/callback'
    )
  })

  it('joins response values with commas in the documented order', () => {
    expect(buildResponseMessage(RESPONSE_VALUES)).toBe(
      'ORD-123,1234567890,true,successful,FP-UID-12345,GBIME,9800000001,230.00,0.00'
    )
  })

  it('omits missing fields as empty strings', () => {
    expect(buildResponseMessage({ PRN: 'ORD-123' })).toBe(
      'ORD-123' + ','.repeat(8)
    )
  })

  it('matches the pinned request DV vector', async () => {
    const dv = await generateFonepayDv(
      buildRequestMessage(REQUEST_VALUES),
      FONEPAY_SECRET
    )
    expect(dv).toBe(REQUEST_DV)
  })

  it('matches the pinned response DV vector', async () => {
    const dv = await generateFonepayDv(
      buildResponseMessage(RESPONSE_VALUES),
      FONEPAY_SECRET
    )
    expect(dv).toBe(RESPONSE_DV)
  })

  it('verifies uppercase and lowercase DVs', async () => {
    const message = buildResponseMessage(RESPONSE_VALUES)
    expect(await verifyFonepayDv(message, FONEPAY_SECRET, RESPONSE_DV)).toBe(
      true
    )
    expect(
      await verifyFonepayDv(message, FONEPAY_SECRET, RESPONSE_DV.toLowerCase())
    ).toBe(true)
  })

  it('rejects a DV computed with the wrong secret', async () => {
    const message = buildResponseMessage(RESPONSE_VALUES)
    expect(
      await verifyFonepayDv(message, FONEPAY_SECRET, 'A'.repeat(128))
    ).toBe(false)
  })

  it('rejects a DV of the wrong length', async () => {
    const message = buildResponseMessage(RESPONSE_VALUES)
    expect(await verifyFonepayDv(message, FONEPAY_SECRET, 'ABCD')).toBe(false)
  })
})
