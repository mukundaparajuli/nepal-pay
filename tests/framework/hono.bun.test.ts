import { describe, expect, it } from 'bun:test'
import { createApp } from '../../apps/hono-example/src/app.js'
import { createMockGateway } from '@nepal-payments/mock'
import {
  createOrder,
  moneyFromDecimal,
  type TxnRef,
} from '@nepal-payments/core'

describe('hono example on Bun', () => {
  it('serves checkout and callback through Bun.serve', async () => {
    expect(typeof Bun).toBe('object')

    const gateway = createMockGateway({ secretKey: 'bun-example-secret' })
    const app = createApp({ gateway })
    const server = Bun.serve({ port: 0, fetch: app.fetch })
    try {
      const base = `http://127.0.0.1:${server.port}`

      const checkoutResponse = await fetch(`${base}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderId: 'ORD-BUN-1',
          amount: '230.00',
        }),
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
      const data = raw.query?.data
      expect(typeof data).toBe('string')

      const callbackResponse = await fetch(
        `${base}/callback?data=${encodeURIComponent(String(data))}`
      )
      expect(callbackResponse.status).toBe(200)
      expect(await callbackResponse.json()).toEqual({
        status: 'completed',
        orderId: 'ORD-BUN-1',
        fulfilledNow: true,
      })

      const duplicate = await fetch(
        `${base}/callback?data=${encodeURIComponent(String(data))}`
      )
      expect(duplicate.status).toBe(200)
      expect((await duplicate.json()).fulfilledNow).toBe(false)

      const invalid = await fetch(`${base}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: 'ORD-BUN-2' }),
      })
      expect(invalid.status).toBe(400)
      expect((await invalid.json()).error).toBe('INVALID_REQUEST')
    } finally {
      server.stop(true)
    }
  })

  it('creates orders through the mock gateway directly', async () => {
    const gateway = createMockGateway({ secretKey: 'bun-example-secret' })
    const order = createOrder({
      id: 'ORD-BUN-DIRECT',
      amount: moneyFromDecimal('230.00'),
    })
    const result = await gateway.createCheckout(order)
    expect(result.checkout.type).toBe('redirect')
    expect(result.txnRef.gateway).toBe('mock')
  })
})
