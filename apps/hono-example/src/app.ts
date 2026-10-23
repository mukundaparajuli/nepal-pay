import { Hono } from 'hono'
import {
  createOrder,
  isPaymentMethod,
  moneyFromDecimal,
  NepalPayError,
  type GatewayAdapter,
  type Order,
  type RawCallbackRequest,
  type TxnRef,
} from '@nepal-pay/core'

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
  if (error instanceof NepalPayError) {
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

interface SimulationGateway {
  pay(txnRef: TxnRef): Promise<unknown>
  generateCallback(txnRef: TxnRef): Promise<RawCallbackRequest>
}

function isSimulationGateway(
  value: GatewayAdapter
): value is GatewayAdapter & SimulationGateway {
  const candidate = value as Partial<SimulationGateway>
  return (
    typeof candidate.pay === 'function' &&
    typeof candidate.generateCallback === 'function'
  )
}

function readTxnRef(value: unknown): TxnRef | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || !isPaymentMethod(record.gateway)) {
    return undefined
  }
  return { id: record.id, gateway: record.gateway }
}

export function createApp(options: CreateAppOptions): Hono {
  const { gateway } = options
  const store = options.store ?? createExampleStore()
  const app = new Hono()

  app.get('/', (c) => {
    return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nepal Pay Hono Example</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem; }
    form, .result { margin-bottom: 2rem; padding: 1rem; border: 1px solid #ddd; border-radius: 8px; }
    .result.success { border-color: #28a745; background: #f0fff4; }
    .result.error { border-color: #c00; background: #fee; }
    input { width: 100%; padding: 0.5rem; margin-bottom: 1rem; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    button { padding: 0.5rem 1rem; background: #0070f3; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0050c3; }
    pre { background: #fff; padding: 0.5rem; overflow: auto; border: 1px solid #ccc; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Nepal Pay Hono Example</h1>
  
  <form id="checkoutForm">
    <h2>Create Checkout</h2>
    <label for="orderId">Order ID</label>
    <input id="orderId" name="orderId" value="ORD-HONO-1" required>
    <label for="amount">Amount (NPR)</label>
    <input id="amount" name="amount" value="230.00" placeholder="230.00" required>
    <button type="submit">Create Checkout</button>
  </form>

  <div id="checkoutResult" class="result" style="display:none;"></div>
  <div id="callbackResult" class="result" style="display:none;"></div>

  <script>
    const form = document.getElementById('checkoutForm');
    const checkoutResult = document.getElementById('checkoutResult');
    const callbackResult = document.getElementById('callbackResult');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = { orderId: formData.get('orderId'), amount: formData.get('amount') };
      
      try {
        const res = await fetch('/checkout', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || result.error);
        
        checkoutResult.className = 'result';
        checkoutResult.innerHTML = \`
          <h2>Checkout Created</h2>
          <p><strong>Gateway:</strong> \${result.txnRef.gateway}</p>
          <p><strong>Transaction ID:</strong> \${result.txnRef.id}</p>
          <p><strong>Checkout Type:</strong> \${result.checkout.type}</p>
          \${result.checkout.type === 'redirect' ? \`<p><strong>Redirect URL:</strong> \${result.checkout.url}</p>\` : ''}
          \${result.checkout.type === 'form_post' ? \`<details><summary>Form Params</summary><pre>\${JSON.stringify(result.checkout.formParams, null, 2)}</pre></details>\` : ''}
          <button onclick="simulatePayment(\${JSON.stringify(result).replace(/"/g, '&quot;')})">Simulate Payment (Mock)</button>
        \`;
        checkoutResult.style.display = 'block';
        callbackResult.style.display = 'none';
      } catch (err) {
        checkoutResult.className = 'result error';
        checkoutResult.innerHTML = \`<strong>Error:</strong> \${err.message}\`;
        checkoutResult.style.display = 'block';
      }
    });
    
    window.simulatePayment = async (checkoutData) => {
      try {
        const parsed = typeof checkoutData === 'string' ? JSON.parse(checkoutData) : checkoutData;
        const res = await fetch('/simulate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(parsed)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || result.error);
        callbackResult.className = 'result success';
        callbackResult.innerHTML = \`
          <h2>Payment Result</h2>
          <p><strong>Status:</strong> \${result.status}</p>
          <p><strong>Order ID:</strong> \${result.orderId}</p>
          <p><strong>Fulfilled Now:</strong> \${result.fulfilledNow}</p>
        \`;
        callbackResult.style.display = 'block';
      } catch (err) {
        callbackResult.className = 'result error';
        callbackResult.innerHTML = \`<strong>Error:</strong> \${err.message}\`;
        callbackResult.style.display = 'block';
      }
    };
  </script>
</body>
</html>
`)
  })

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

  app.post('/simulate', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'INVALID_REQUEST', message: 'invalid JSON' }, 400)
    }
    try {
      const data = body as { txnRef?: unknown } | null
      const txnRef = readTxnRef(data?.txnRef)
      if (txnRef === undefined) {
        return c.json(
          { error: 'INVALID_REQUEST', message: 'missing txnRef' },
          400
        )
      }
      if (!isSimulationGateway(gateway)) {
        return c.json(
          {
            error: 'UNSUPPORTED_GATEWAY',
            message: 'gateway does not support simulation',
          },
          400
        )
      }
      await gateway.pay(txnRef)
      const raw = await gateway.generateCallback(txnRef)
      const callback = gateway.parseCallback(raw)
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
