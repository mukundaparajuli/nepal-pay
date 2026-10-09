import { describe, it, expect } from 'vitest'
import request from 'supertest'
import {
  createApp,
  createExampleStore,
} from '../../apps/express-example/src/app.js'
import { mockGateway } from '../mock/helpers.js'
import { safeBase64Encode } from '@nepal-payments/core'
import { signMockCallback } from '@nepal-payments/mock'
import { callbackData } from './helpers.js'

describe('express example', () => {
  it('runs the merchant flow through Express', async () => {
    const gateway = mockGateway()
    const store = createExampleStore()
    const app = createApp({ gateway, store })

    const checkout = await request(app)
      .post('/checkout')
      .send({ orderId: 'ORD-EXP-1', amount: '230.00' })
    expect(checkout.status).toBe(200)
    expect(checkout.body.checkout.type).toBe('redirect')
    expect(checkout.body.txnRef.gateway).toBe('mock')

    await gateway.pay(checkout.body.txnRef)

    const raw = await gateway.generateCallback(checkout.body.txnRef)
    const data = callbackData(raw)
    const first = await request(app).get(
      `/callback?data=${encodeURIComponent(data)}`
    )
    expect(first.status).toBe(200)
    expect(first.body).toEqual({
      status: 'completed',
      orderId: 'ORD-EXP-1',
      fulfilledNow: true,
    })

    const second = await request(app).get(
      `/callback?data=${encodeURIComponent(data)}`
    )
    expect(second.status).toBe(200)
    expect(second.body).toEqual({
      status: 'completed',
      orderId: 'ORD-EXP-1',
      fulfilledNow: false,
    })
  })

  it('rejects an invalid checkout payload', async () => {
    const app = createApp({ gateway: mockGateway() })
    const response = await request(app)
      .post('/checkout')
      .send({ orderId: 'ORD-EXP-2' })
    expect(response.status).toBe(400)
    expect(response.body.error).toBe('INVALID_REQUEST')
  })

  it('rejects an unparseable amount', async () => {
    const app = createApp({ gateway: mockGateway() })
    const response = await request(app)
      .post('/checkout')
      .send({ orderId: 'ORD-EXP-3', amount: 'not-money' })
    expect(response.status).toBe(400)
    expect(typeof response.body.error).toBe('string')
  })

  it('rejects a tampered callback signature', async () => {
    const gateway = mockGateway()
    const store = createExampleStore()
    const app = createApp({ gateway, store })

    const checkout = await request(app)
      .post('/checkout')
      .send({ orderId: 'ORD-EXP-4', amount: '230.00' })
    await gateway.pay(checkout.body.txnRef)

    const signature = await signMockCallback(
      {
        txn_id: checkout.body.txnRef.id,
        order_id: 'ORD-EXP-4',
        amount: '23000',
        status: 'completed',
      },
      'wrong-secret'
    )
    const data = safeBase64Encode(
      JSON.stringify({
        txn_id: checkout.body.txnRef.id,
        order_id: 'ORD-EXP-4',
        amount: '23000',
        status: 'completed',
        signature,
      })
    )
    const response = await request(app).get(
      `/callback?data=${encodeURIComponent(data)}`
    )
    expect(response.status).toBe(400)
    expect(response.body.error).toBe('SIGNATURE_MISMATCH')
  })

  it('rejects a callback for an unknown checkout', async () => {
    const app = createApp({ gateway: mockGateway() })
    const signature = await signMockCallback(
      {
        txn_id: 'mock_orphan0000001',
        order_id: 'ORD-EXP-5',
        amount: '23000',
        status: 'completed',
      },
      'mock-secret-key-123'
    )
    const data = safeBase64Encode(
      JSON.stringify({
        txn_id: 'mock_orphan0000001',
        order_id: 'ORD-EXP-5',
        amount: '23000',
        status: 'completed',
        signature,
      })
    )
    const response = await request(app).get(
      `/callback?data=${encodeURIComponent(data)}`
    )
    expect(response.status).toBe(404)
    expect(response.body.error).toBe('UNKNOWN_CHECKOUT')
  })
})
