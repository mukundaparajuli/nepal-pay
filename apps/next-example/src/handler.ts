import {
  createOrder,
  moneyFromDecimal,
  NepalPaymentsError,
  type GatewayAdapter,
  type Order,
} from '@nepal-payments/core'
import { getGateway, store, type ExampleStore } from './store'

export interface HandlerResult {
  readonly status: number
  readonly body: Record<string, unknown>
}

export interface HandlerDeps {
  readonly gateway: GatewayAdapter
  readonly store: ExampleStore
}

function defaultDeps(): HandlerDeps {
  return { gateway: getGateway(), store }
}

function errorResult(error: unknown): HandlerResult {
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

export async function handleCheckout(
  input: unknown,
  deps: HandlerDeps = defaultDeps()
): Promise<HandlerResult> {
  const record =
    typeof input === 'object' && input !== null
      ? (input as Record<string, unknown>)
      : {}
  if (typeof record.orderId !== 'string' || typeof record.amount !== 'string') {
    return {
      status: 400,
      body: {
        error: 'INVALID_REQUEST',
        message: 'expected orderId and amount strings',
      },
    }
  }
  try {
    const order = createOrder({
      id: record.orderId,
      amount: moneyFromDecimal(record.amount),
    })
    deps.store.orders.set(order.id, order)
    const result = await deps.gateway.createCheckout(order)
    deps.store.txnToOrder.set(result.txnRef.id, order.id)
    return {
      status: 200,
      body: { checkout: result.checkout, txnRef: result.txnRef },
    }
  } catch (error) {
    return errorResult(error)
  }
}

export async function handleCallback(
  query: Record<string, unknown>,
  deps: HandlerDeps = defaultDeps()
): Promise<HandlerResult> {
  try {
    const callback = deps.gateway.parseCallback({ query })
    const txnId = String(callback.data.txn_id ?? '')
    const orderId = deps.store.txnToOrder.get(txnId)
    if (orderId === undefined) {
      return { status: 404, body: { error: 'UNKNOWN_CHECKOUT' } }
    }
    const expected: Order | undefined = deps.store.orders.get(orderId)
    if (expected === undefined) {
      return { status: 404, body: { error: 'UNKNOWN_ORDER' } }
    }
    const payment = await deps.gateway.verify(callback, { expected })
    let fulfilledNow = false
    if (payment.status === 'completed') {
      if (!deps.store.fulfilled.has(payment.orderId)) {
        deps.store.fulfilled.add(payment.orderId)
        fulfilledNow = true
      }
    }
    return {
      status: 200,
      body: {
        status: payment.status,
        orderId: payment.orderId,
        fulfilledNow,
      },
    }
  } catch (error) {
    return errorResult(error)
  }
}
