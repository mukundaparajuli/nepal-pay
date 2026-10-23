'use client'

import { useState, type ReactNode } from 'react'
import type { TxnRef, Checkout } from '@nepal-payments/core'

type CheckoutResponse = {
  checkout: Checkout
  txnRef: TxnRef
}

type CallbackResponse = {
  status: string
  orderId: string
  fulfilledNow: boolean
}

export default function HomePage(): ReactNode {
  const [orderId, setOrderId] = useState('ORD-NEXT-1')
  const [amount, setAmount] = useState('230.00')
  const [checkoutData, setCheckoutData] = useState<CheckoutResponse | null>(
    null
  )
  const [callbackData, setCallbackData] = useState<CallbackResponse | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setCallbackData(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId, amount }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Checkout failed')
      }
      setCheckoutData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleSimulatePayment = async () => {
    if (!checkoutData) return
    setLoading(true)
    setError(null)
    try {
      const { getGateway } = await import('../src/store')
      const gateway = getGateway()
      await gateway.pay(checkoutData.txnRef)
      const raw = await gateway.generateCallback(checkoutData.txnRef)
      const data = raw.query?.data
      if (typeof data !== 'string') {
        throw new Error('Failed to generate callback')
      }
      const cbRes = await fetch(
        `/api/payment/callback?data=${encodeURIComponent(data)}`
      )
      const cbData = await cbRes.json()
      if (!cbRes.ok) {
        throw new Error(cbData.message || cbData.error || 'Callback failed')
      }
      setCallbackData(cbData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '2rem',
        fontFamily: 'system-ui',
      }}
    >
      <h1>Nepal Payments Next.js example</h1>

      <form
        onSubmit={handleCheckout}
        style={{
          marginBottom: '2rem',
          padding: '1rem',
          border: '1px solid #ddd',
          borderRadius: '8px',
        }}
      >
        <h2>Create Checkout</h2>
        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="orderId"
            style={{ display: 'block', marginBottom: '0.25rem' }}
          >
            Order ID
          </label>
          <input
            id="orderId"
            type="text"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
            required
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="amount"
            style={{ display: 'block', marginBottom: '0.25rem' }}
          >
            Amount (NPR)
          </label>
          <input
            id="amount"
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="230.00"
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            background: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Processing...' : 'Create Checkout'}
        </button>
      </form>

      {error && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1rem',
            background: '#fee',
            color: '#c00',
            borderRadius: '4px',
          }}
        >
          {error}
        </div>
      )}

      {checkoutData && (
        <div
          style={{
            marginBottom: '2rem',
            padding: '1rem',
            border: '1px solid #ddd',
            borderRadius: '8px',
            background: '#f9f9f9',
          }}
        >
          <h2>Checkout Created</h2>
          <p>
            <strong>Gateway:</strong> {checkoutData.txnRef.gateway}
          </p>
          <p>
            <strong>Transaction ID:</strong> {checkoutData.txnRef.id}
          </p>
          <p>
            <strong>Checkout Type:</strong> {checkoutData.checkout.type}
          </p>
          {checkoutData.checkout.type === 'redirect' && (
            <p>
              <strong>Redirect URL:</strong> {checkoutData.checkout.url}
            </p>
          )}
          {checkoutData.checkout.type === 'form_post' && (
            <div>
              <p>
                <strong>Form URL:</strong> {checkoutData.checkout.url}
              </p>
              <details>
                <summary>Form Params</summary>
                <pre
                  style={{
                    background: '#fff',
                    padding: '0.5rem',
                    overflow: 'auto',
                    border: '1px solid #ccc',
                  }}
                >
                  {JSON.stringify(checkoutData.checkout.formParams, null, 2)}
                </pre>
              </details>
            </div>
          )}
          <button
            onClick={handleSimulatePayment}
            disabled={loading}
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem 1rem',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Processing...' : 'Simulate Payment (Mock)'}
          </button>
        </div>
      )}

      {callbackData && (
        <div
          style={{
            padding: '1rem',
            border: '1px solid #28a745',
            borderRadius: '8px',
            background: '#f0fff4',
          }}
        >
          <h2>Payment Result</h2>
          <p>
            <strong>Status:</strong> {callbackData.status}
          </p>
          <p>
            <strong>Order ID:</strong> {callbackData.orderId}
          </p>
          <p>
            <strong>Fulfilled Now:</strong> {String(callbackData.fulfilledNow)}
          </p>
        </div>
      )}
    </main>
  )
}
