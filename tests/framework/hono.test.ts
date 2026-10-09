import { describe, it, expect } from 'vitest'
import {
  createApp,
  createExampleStore,
} from '../../apps/hono-example/src/app.js'
import { startServer } from '../../apps/hono-example/src/server.js'
import { mockGateway } from '../mock/helpers.js'
import { safeBase64Encode, type TxnRef } from '@nepal-payments/core'
import { signMockCallback } from '@nepal-payments/mock'
import { callbackData } from './helpers.js'

describe('hono example', () => {
  it('runs the merchant flow through Hono', async () => {
    const gateway = mockGateway()
    const store = createExampleStore()
    const app = createApp({ gateway, store })

    const checkoutResponse = await app.request('http://localhost/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId: 'ORD-HONO-1', amount: '230.00' }),
    })
    expect(checkoutResponse.status).toBe(200)
    const checkout = (await checkoutResponse.json()) as {
      checkout: { type: string; url: string }
      txnRef: TxnRef
    }
    expect(checkout.checkout.type).toBe('redirect')
    expect(checkout.txnRef.gateway).toBe('mock')

    await gateway.pay(checkout.txnRef)

    const raw = await gateway.generateCallback(checkout.txnRef)
    const data = callbackData(raw)
    const first = await app.request(
      `http://localhost/callback?data=${encodeURIComponent(data)}`
    )
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({
      status: 'completed',
      orderId: 'ORD-HONO-1',
      fulfilledNow: true,
    })

    const second = await app.request(
      `http://localhost/callback?data=${encodeURIComponent(data)}`
    )
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({
      status: 'completed',
      orderId: 'ORD-HONO-1',
      fulfilledNow: false,
    })
  })

  it('rejects invalid requests', async () => {
    const app = createApp({ gateway: mockGateway() })

    const badJson = await app.request('http://localhost/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(badJson.status).toBe(400)

    const missingFields = await app.request('http://localhost/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId: 'ORD-HONO-2' }),
    })
    expect(missingFields.status).toBe(400)
    expect((await missingFields.json()).error).toBe('INVALID_REQUEST')
  })

  it('rejects a tampered callback signature', async () => {
    const gateway = mockGateway()
    const app = createApp({ gateway })

    const checkoutResponse = await app.request('http://localhost/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId: 'ORD-HONO-3', amount: '230.00' }),
    })
    const checkout = (await checkoutResponse.json()) as {
      txnRef: TxnRef
    }
    await gateway.pay(checkout.txnRef)

    const signature = await signMockCallback(
      {
        txn_id: checkout.txnRef.id,
        order_id: 'ORD-HONO-3',
        amount: '23000',
        status: 'completed',
      },
      'wrong-secret'
    )
    const data = safeBase64Encode(
      JSON.stringify({
        txn_id: checkout.txnRef.id,
        order_id: 'ORD-HONO-3',
        amount: '23000',
        status: 'completed',
        signature,
      })
    )
    const response = await app.request(
      `http://localhost/callback?data=${encodeURIComponent(data)}`
    )
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('SIGNATURE_MISMATCH')
  })

  it('serves the flow over a real Node HTTP server', async () => {
    const gateway = mockGateway()
    const server = startServer({ gateway })
    try {
      const checkoutResponse = await fetch(`${server.url}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: 'ORD-HONO-4', amount: '230.00' }),
      })
      expect(checkoutResponse.status).toBe(200)
      const checkout = (await checkoutResponse.json()) as {
        txnRef: TxnRef
      }
      await gateway.pay(checkout.txnRef)

      const raw = await gateway.generateCallback(checkout.txnRef)
      const data = callbackData(raw)
      const callbackResponse = await fetch(
        `${server.url}/callback?data=${encodeURIComponent(data)}`
      )
      expect(callbackResponse.status).toBe(200)
      expect(await callbackResponse.json()).toEqual({
        status: 'completed',
        orderId: 'ORD-HONO-4',
        fulfilledNow: true,
      })
    } finally {
      await server.close()
    }
  })
})
