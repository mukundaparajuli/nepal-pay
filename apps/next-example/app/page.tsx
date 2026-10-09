import type { ReactNode } from 'react'

export default function HomePage(): ReactNode {
  return (
    <main>
      <h1>Nepal Payments Next.js example</h1>
      <p>
        POST /api/checkout to start a payment, then GET /api/payment/callback.
      </p>
    </main>
  )
}
