import { describe, it, expect } from 'vitest'
import {
  callbackFingerprint,
  safeBase64Encode,
  VerificationError,
} from '@nepal-payments/core'
import { signMockCallback } from '@nepal-payments/mock'
import { mockGateway, MOCK_SECRET, order } from './helpers.js'

describe('mock security', () => {
  it('does not leak the secret in parse or verify output', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const raw = await gateway.generateCallback(result.txnRef)
    const callback = gateway.parseCallback(raw)
    const payment = await gateway.verify(callback, { expected: order() })
    const text = JSON.stringify(
      { callback, payment },
      (_key, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value
    )
    expect(text).not.toContain(MOCK_SECRET)
  })

  it('rejects a callback whose signature was computed over different fields', async () => {
    const values = {
      txn_id: 'mock_9f86d081884c7d65',
      order_id: 'ORD-MOCK-1',
      amount: '23000',
      status: 'completed',
    }
    const signature = await signMockCallback(
      { ...values, status: 'pending' },
      MOCK_SECRET
    )
    const payload = { ...values, signature }
    const raw = { query: { data: safeBase64Encode(JSON.stringify(payload)) } }
    const gateway = mockGateway()
    const error = await gateway
      .verify(gateway.parseCallback(raw), { expected: order() })
      .then(
        () => undefined,
        (caught: unknown) => caught
      )
    expect((error as VerificationError).code).toBe('SIGNATURE_MISMATCH')
  })

  it('does not seal completed when a callback arrives before payment', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(order())
    // The gateway never emits a callback for an unpaid transaction, so an
    // attacker has to hand-build one; it must not read as completed.
    const signature = await signMockCallback(
      {
        txn_id: result.txnRef.id,
        order_id: order().id,
        amount: '23000',
        status: 'completed',
      },
      MOCK_SECRET
    )
    const payload = {
      txn_id: result.txnRef.id,
      order_id: order().id,
      amount: '23000',
      status: 'completed',
      signature,
    }
    const raw = { query: { data: safeBase64Encode(JSON.stringify(payload)) } }
    const payment = await gateway.verify(gateway.parseCallback(raw), {
      expected: order(),
    })
    // Ledger truth wins: the install is only initiated, so the payment is pending.
    expect(payment.status).toBe('pending')
  })

  it('seals tampered-status callbacks to the ledger truth', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const good = (await gateway.generateCallback(result.txnRef)) as {
      query: { data: string }
    }
    const payload = JSON.parse(
      Buffer.from(good.query.data, 'base64').toString('utf8')
    ) as Record<string, string>
    // An attacker who knows the signing inputs re-signs a status lie.
    const signature = await signMockCallback(
      {
        txn_id: payload.txn_id as string,
        order_id: payload.order_id as string,
        amount: payload.amount as string,
        status: 'pending',
      },
      MOCK_SECRET
    )
    const forged: Record<string, string> = {
      ...payload,
      status: 'pending',
      signature,
    }
    if (forged.user !== undefined) delete forged.user
    const raw = { query: { data: safeBase64Encode(JSON.stringify(forged)) } }
    const payment = await gateway.verify(gateway.parseCallback(raw), {
      expected: order(),
    })
    expect(payment.status).toBe('completed')
  })

  it('fingerprints stay stable across identical callbacks', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const first = gateway.parseCallback(
      await gateway.generateCallback(result.txnRef)
    )
    const second = gateway.parseCallback(
      await gateway.generateCallback(result.txnRef)
    )
    expect(await callbackFingerprint(first)).toBe(
      await callbackFingerprint(second)
    )
  })

  it('keeps signed values out of the raw ledger clone', async () => {
    const gateway = mockGateway()
    const result = await gateway.createCheckout(order())
    await gateway.pay(result.txnRef)
    const payment = await gateway.verify(
      gateway.parseCallback(await gateway.generateCallback(result.txnRef)),
      { expected: order() }
    )
    const rawLedger = payment.raw?.ledger as Record<string, unknown>
    expect(rawLedger['signature']).toBeUndefined()
    expect(rawLedger['amount']).toBe(23000n)
  })
})
