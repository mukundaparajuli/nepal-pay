import express, { type Express, type Request, type Response } from 'express'
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

interface ErrorResponse {
  readonly status: number
  readonly body: Record<string, unknown>
}

function toErrorResponse(error: unknown): ErrorResponse {
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

function readCheckoutBody(
  body: unknown
): { orderId: string; amount: string } | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const record = body as Record<string, unknown>
  if (typeof record.orderId !== 'string' || typeof record.amount !== 'string') {
    return undefined
  }
  return { orderId: record.orderId, amount: record.amount }
}

export function createApp(options: CreateAppOptions): Express {
  const { gateway } = options
  const store = options.store ?? createExampleStore()
  const app = express()
  app.use(express.json())

  app.post('/checkout', async (req: Request, res: Response) => {
    try {
      const body = readCheckoutBody(req.body)
      if (body === undefined) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'expected orderId and amount strings',
        })
        return
      }
      const order = createOrder({
        id: body.orderId,
        amount: moneyFromDecimal(body.amount),
      })
      store.orders.set(order.id, order)
      const result = await gateway.createCheckout(order)
      store.txnToOrder.set(result.txnRef.id, order.id)
      res.json({ checkout: result.checkout, txnRef: result.txnRef })
    } catch (error) {
      const { status, body: errorBody } = toErrorResponse(error)
      res.status(status).json(errorBody)
    }
  })

  app.get('/callback', async (req: Request, res: Response) => {
    try {
      const callback = gateway.parseCallback({ query: req.query })
      const txnId = String(callback.data.txn_id ?? '')
      const orderId = store.txnToOrder.get(txnId)
      if (orderId === undefined) {
        res.status(404).json({ error: 'UNKNOWN_CHECKOUT' })
        return
      }
      const expected = store.orders.get(orderId)
      if (expected === undefined) {
        res.status(404).json({ error: 'UNKNOWN_ORDER' })
        return
      }
      const payment = await gateway.verify(callback, { expected })
      let fulfilledNow = false
      if (payment.status === 'completed') {
        if (!store.fulfilled.has(payment.orderId)) {
          store.fulfilled.add(payment.orderId)
          fulfilledNow = true
        }
      }
      res.json({
        status: payment.status,
        orderId: payment.orderId,
        fulfilledNow,
      })
    } catch (error) {
      const { status, body: errorBody } = toErrorResponse(error)
      res.status(status).json(errorBody)
    }
  })

  return app
}
