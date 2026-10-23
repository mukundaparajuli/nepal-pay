import { describe, it, expect } from 'vitest'
import {
  buildSignatureMessage,
  signFields,
  verifySignedFields,
  decodeRawJsonTokens,
} from '@nepal-pay/esewa'
import { SANDBOX_SECRET } from './helpers.js'

describe('eSewa signing', () => {
  it('reproduces the published eSewa UAT vector', async () => {
    const signature = await signFields(
      {
        total_amount: '110',
        transaction_uuid: '241028',
        product_code: 'EPAYTEST',
      },
      'total_amount,transaction_uuid,product_code',
      SANDBOX_SECRET
    )
    expect(signature).toBe('i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME=')
  })

  it('builds the message from signed_field_names order, not object order', () => {
    expect(
      buildSignatureMessage(
        {
          product_code: 'EPAYTEST',
          transaction_uuid: '241028',
          total_amount: '110',
        },
        'total_amount,transaction_uuid,product_code'
      )
    ).toBe('total_amount=110,transaction_uuid=241028,product_code=EPAYTEST')
  })

  it('includes signed_field_names itself when it is a signed field', () => {
    const sfn = 'transaction_code,status,signed_field_names'
    const message = buildSignatureMessage(
      {
        transaction_code: '0004T5I',
        status: 'COMPLETE',
        signed_field_names: sfn,
      },
      sfn
    )
    expect(message).toBe(
      'transaction_code=0004T5I,status=COMPLETE,signed_field_names=transaction_code,status,signed_field_names'
    )
  })

  it('rejects a message with a signed field missing from the values', () => {
    expect(() =>
      buildSignatureMessage(
        { total_amount: '110' },
        'total_amount,transaction_uuid,product_code'
      )
    ).toThrow(/transaction_uuid/)
  })

  it('rejects an empty or malformed signed_field_names', () => {
    expect(() => buildSignatureMessage({}, '')).toThrow()
    expect(() => buildSignatureMessage({}, 'a,,b')).toThrow()
  })

  it('verifies a matching signature', async () => {
    const values = {
      total_amount: '110',
      transaction_uuid: '241028',
      product_code: 'EPAYTEST',
    }
    const sfn = 'total_amount,transaction_uuid,product_code'
    const signature = await signFields(values, sfn, SANDBOX_SECRET)
    await expect(
      verifySignedFields(values, sfn, SANDBOX_SECRET, signature)
    ).resolves.toBe(true)
  })

  it('rejects a tampered value', async () => {
    const sfn = 'total_amount,transaction_uuid,product_code'
    const signature = await signFields(
      {
        total_amount: '110',
        transaction_uuid: '241028',
        product_code: 'EPAYTEST',
      },
      sfn,
      SANDBOX_SECRET
    )
    await expect(
      verifySignedFields(
        {
          total_amount: '999',
          transaction_uuid: '241028',
          product_code: 'EPAYTEST',
        },
        sfn,
        SANDBOX_SECRET,
        signature
      )
    ).resolves.toBe(false)
  })

  it('rejects a signature made with the wrong secret', async () => {
    const values = {
      total_amount: '110',
      transaction_uuid: '241028',
      product_code: 'EPAYTEST',
    }
    const sfn = 'total_amount,transaction_uuid,product_code'
    const signature = await signFields(values, sfn, 'other-secret')
    await expect(
      verifySignedFields(values, sfn, SANDBOX_SECRET, signature)
    ).resolves.toBe(false)
  })

  it('rejects garbage and empty signatures without throwing', async () => {
    const values = {
      total_amount: '110',
      transaction_uuid: '241028',
      product_code: 'EPAYTEST',
    }
    const sfn = 'total_amount,transaction_uuid,product_code'
    for (const signature of ['', 'not-base64!!!', 'AAAA', '////']) {
      await expect(
        verifySignedFields(values, sfn, SANDBOX_SECRET, signature)
      ).resolves.toBe(false)
    }
  })

  it('tolerates url-safe base64 in a received signature', async () => {
    const values = {
      total_amount: '110',
      transaction_uuid: '241028',
      product_code: 'EPAYTEST',
    }
    const sfn = 'total_amount,transaction_uuid,product_code'
    const signature = await signFields(values, sfn, SANDBOX_SECRET)
    const urlSafe = signature.replace(/\+/g, '-').replace(/\//g, '_')
    await expect(
      verifySignedFields(values, sfn, SANDBOX_SECRET, urlSafe)
    ).resolves.toBe(true)
  })

  it('decodes raw JSON tokens preserving numeric literals', () => {
    const text =
      '{"status":"COMPLETE","total_amount":110.0,"transaction_code":"000AWEO","ok":true,"note":null}'
    expect(decodeRawJsonTokens(text)).toEqual({
      status: 'COMPLETE',
      total_amount: '110.0',
      transaction_code: '000AWEO',
      ok: 'true',
      note: 'null',
    })
  })

  it('unescapes string tokens', () => {
    expect(decodeRawJsonTokens('{"a":"x\\"y\\\\z"}')).toEqual({
      a: 'x"y\\z',
    })
  })
})
