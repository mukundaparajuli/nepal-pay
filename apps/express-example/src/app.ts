import express, { type Express, type Request, type Response } from 'express'
import {
  createOrder,
  isPaymentMethod,
  moneyFromDecimal,
  NepalPaymentsError,
  type GatewayAdapter,
  type Order,
  type RawCallbackRequest,
  type TxnRef,
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

export function createApp(options: CreateAppOptions): Express {
  const { gateway } = options
  const store = options.store ?? createExampleStore()
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  app.get('/', (req: Request, res: Response) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nepal Payments Express Example</title>
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
  <h1>Nepal Payments Express Example</h1>
  
  <form id="checkoutForm">
    <h2>Create Checkout</h2>
    <label for="orderId">Order ID</label>
    <input id="orderId" name="orderId" value="ORD-EXP-1" required>
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

  app.post('/simulate', async (req: Request, res: Response) => {
    try {
      const body = req.body as { txnRef?: unknown } | undefined
      const txnRef = readTxnRef(body?.txnRef)
      if (txnRef === undefined) {
        res
          .status(400)
          .json({ error: 'INVALID_REQUEST', message: 'missing txnRef' })
        return
      }
      if (!isSimulationGateway(gateway)) {
        res.status(400).json({
          error: 'UNSUPPORTED_GATEWAY',
          message: 'gateway does not support simulation',
        })
        return
      }
      await gateway.pay(txnRef)
      const raw = await gateway.generateCallback(txnRef)
      const callback = gateway.parseCallback(raw)
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
