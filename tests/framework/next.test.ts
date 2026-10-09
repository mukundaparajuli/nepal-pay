import { describe, it, expect } from 'vitest'
import { POST as checkoutPost } from '../../apps/next-example/app/api/checkout/route.js'
import { GET as callbackGet } from '../../apps/next-example/app/api/payment/callback/route.js'
import { getGateway } from '../../apps/next-example/src/store.js'
import type { TxnRef } from '@nepal-payments/core'
import { safeBase64Encode } from '@nepal-payments/core'
import { signMockCallback } from '@nepal-payments/mock'
import { callbackData } from './helpers.js'

function checkoutRequest(body: unknown, validJson = true): Promise<Response> {
  return checkoutPost(
    new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: validJson ? JSON.stringify(body) : String(body),
    })
  )
}

function callbackRequest(data: string): Promise<Response> {
  return callbackGet(
    new Request(
      `http://localhost/api/payment/callback?data=${encodeURIComponent(data)}`
    )
  )
}

describe('next example route handlers', () => {
  it('runs the merchant flow through App Router routes', async () => {
    const checkoutResponse = await checkoutRequest({
      orderId: 'ORD-NEXT-1',
      amount: '230.00',
    })
    expect(checkoutResponse.status).toBe(200)
    const checkout = (await checkoutResponse.json()) as {
      checkout: { type: string; url: string }
      txnRef: TxnRef
    }
    expect(checkout.checkout.type).toBe('redirect')
    expect(checkout.txnRef.gateway).toBe('mock')

    const gateway = getGateway()
    await gateway.pay(checkout.txnRef)

    const raw = await gateway.generateCallback(checkout.txnRef)
    const data = callbackData(raw)

    const first = await callbackRequest(data)
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({
      status: 'completed',
      orderId: 'ORD-NEXT-1',
      fulfilledNow: true,
    })

    const second = await callbackRequest(data)
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({
      status: 'completed',
      orderId: 'ORD-NEXT-1',
      fulfilledNow: false,
    })
  })

  it('rejects invalid JSON and missing fields', async () => {
    const invalidJson = await checkoutRequest('not json at all', false)
    expect(invalidJson.status).toBe(400)
    expect((await invalidJson.json()).error).toBe('INVALID_REQUEST')

    const missingFields = await checkoutRequest({ orderId: 'ORD-NEXT-2' })
    expect(missingFields.status).toBe(400)
    expect((await missingFields.json()).error).toBe('INVALID_REQUEST')
  })

  it('rejects a tampered callback signature', async () => {
    const checkoutResponse = await checkoutRequest({
      orderId: 'ORD-NEXT-3',
      amount: '230.00',
    })
    const checkout = (await checkoutResponse.json()) as { txnRef: TxnRef }
    const gateway = getGateway()
    await gateway.pay(checkout.txnRef)

    const signature = await signMockCallback(
      {
        txn_id: checkout.txnRef.id,
        order_id: 'ORD-NEXT-3',
        amount: '23000',
        status: 'completed',
      },
      'wrong-secret'
    )
    const data = safeBase64Encode(
      JSON.stringify({
        txn_id: checkout.txnRef.id,
        order_id: 'ORD-NEXT-3',
        amount: '23000',
        status: 'completed',
        signature,
      })
    )
    const response = await callbackRequest(data)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('SIGNATURE_MISMATCH')
  })

  it('rejects a callback for an unknown checkout', async () => {
    const signature = await signMockCallback(
      {
        txn_id: 'mock_orphan0000002',
        order_id: 'ORD-NEXT-4',
        amount: '23000',
        status: 'completed',
      },
      'next-example-dev-secret'
    )
    const data = safeBase64Encode(
      JSON.stringify({
        txn_id: 'mock_orphan0000002',
        order_id: 'ORD-NEXT-4',
        amount: '23000',
        status: 'completed',
        signature,
      })
    )
    const response = await callbackRequest(data)
    expect(response.status).toBe(404)
    expect((await response.json()).error).toBe('UNKNOWN_CHECKOUT')
  })
})
