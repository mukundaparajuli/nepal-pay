import { Hono } from 'hono'
import {
  createOrder,
  moneyFromDecimal,
  NepalPaymentsError,
  type GatewayAdapter,
  type Order,
} from '@nepal-payments/core'

export interface ExampleStore {
  readonly orders: Map<string, Order>
  readonly txnToOrder: Map<string, string>
  readonly fulfilled: Set<string>
}

export function createExampleStore(): ExampleStore {
  return {
    orders: new Map(),
    txnToOrder: new Map(),
    fulfilled: new Set(),
  }
}

export interface CreateAppOptions {
  readonly gateway: GatewayAdapter
  readonly store?: ExampleStore
}

function errorMessage(error: unknown): {
  status: number
  body: Record<string, unknown>
} {
  if (error instanceof NepalPaymentsError) {
    return {
      status: 400,
      body: { error: error.code ?? 'ERROR', message: error.message },
    }
  }
  return {
    status: 500,
    body: { error: 'INTERNAL', message: 'unexpected server error' },
  }
}

export function createApp(options: CreateAppOptions): Hono {
  const { gateway } = options
  const store = options.store ?? createExampleStore()
  const app = new Hono()

  app.post('/checkout', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'INVALID_REQUEST', message: 'invalid JSON' }, 400)
    }
    const record =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)
        : {}
    if (
      typeof record.orderId !== 'string' ||
      typeof record.amount !== 'string'
    ) {
      return c.json(
        {
          error: 'INVALID_REQUEST',
          message: 'expected orderId and amount strings',
        },
        400
      )
    }
    try {
      const order = createOrder({
        id: record.orderId,
        amount: moneyFromDecimal(record.amount),
      })
      store.orders.set(order.id, order)
      const result = await gateway.createCheckout(order)
      store.txnToOrder.set(result.txnRef.id, order.id)
      return c.json({ checkout: result.checkout, txnRef: result.txnRef })
    } catch (error) {
      const { status, body: errorBody } = errorMessage(error)
      return c.json(errorBody, status as 400 | 500)
    }
  })

  app.get('/callback', async (c) => {
    try {
      const callback = gateway.parseCallback({ query: c.req.query() })
      const txnId = String(callback.data.txn_id ?? '')
      const orderId = store.txnToOrder.get(txnId)
      if (orderId === undefined) {
        return c.json({ error: 'UNKNOWN_CHECKOUT' }, 404)
      }
      const expected = store.orders.get(orderId)
      if (expected === undefined) {
        return c.json({ error: 'UNKNOWN_ORDER' }, 404)
      }
      const payment = await gateway.verify(callback, { expected })
      let fulfilledNow = false
      if (payment.status === 'completed') {
        if (!store.fulfilled.has(payment.orderId)) {
          store.fulfilled.add(payment.orderId)
          fulfilledNow = true
        }
      }
      return c.json({
        status: payment.status,
        orderId: payment.orderId,
        fulfilledNow,
      })
    } catch (error) {
      const { status, body: errorBody } = errorMessage(error)
      return c.json(errorBody, status as 400 | 500)
    }
  })

  return app
}
