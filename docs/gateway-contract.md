# Gateway Contract (Frozen)

This document defines the frozen public contract for the SDK. From this point forward, core interfaces MUST NOT be changed unless explicitly instructed.

## Core Types

### Money
```ts
export interface Money {
  readonly amount: string // decimal string, e.g., "1000.00"
  readonly currency: Currency // "NPR"
}
export type Currency = 'NPR'
```

### Order
```ts
export interface Order {
  readonly id: string
  readonly amount: Money
  readonly productName: string
  readonly productDescription?: string
  readonly customerName?: string
  readonly customerEmail?: string
  readonly customerPhone?: string
  readonly metadata?: Record<string, unknown>
}
```

### Checkout
```ts
export interface Checkout {
  readonly returnUrl: string
  readonly failureUrl: string
  readonly callbackUrl?: string
  readonly metadata?: Record<string, unknown>
}
```

### TxnRef
```ts
export interface TxnRef {
  readonly id: string // gateway transaction/reference id
  readonly gateway: PaymentMethod
  readonly raw?: Record<string, unknown>
}
```

### PaymentStatus
```ts
export type PaymentStatus = 'success' | 'failed' | 'pending' | 'cancelled' | 'expired'
```

### PaymentMethod
```ts
export type PaymentMethod = 'esewa' | 'khalti' | 'connectips' | 'fonepay'
```

### UnverifiedCallback
```ts
export interface UnverifiedCallback {
  readonly gateway: PaymentMethod
  readonly payload: Record<string, unknown>
  readonly headers?: Record<string, string>
}
```

### VerifiedPayment
```ts
export interface VerifiedPayment {
  readonly orderId: string
  readonly txnRef: TxnRef
  readonly amount: Money
  readonly status: PaymentStatus
  readonly method: PaymentMethod
  readonly verifiedAt: Date
  readonly raw: Record<string, unknown>
}
```

## Adapter Contract

### GatewayAdapter
```ts
export interface GatewayAdapter {
  readonly name: PaymentMethod
  readonly config: GatewayConfig
  
  initiate(order: Order, checkout: Checkout): Promise<CheckoutResult>
  verify(callback: UnverifiedCallback, options?: VerifyOptions): Promise<VerifiedPayment>
  getStatus?(txnRef: TxnRef, options?: StatusOptions): Promise<VerifiedPayment>
}
```

### CheckoutResult
```ts
export interface CheckoutResult {
  readonly checkoutUrl: string
  readonly txnRef: TxnRef
  readonly formFields?: Record<string, string> // for form-POST flows
  readonly method: 'redirect' | 'form' | 'api'
  readonly raw?: Record<string, unknown>
}
```

## Supporting Types

### GatewayConfig
```ts
export interface GatewayConfig {
  readonly sandbox?: boolean
  readonly [key: string]: unknown
}
```

### VerifyOptions
```ts
export interface VerifyOptions {
  readonly [key: string]: unknown
}
```

### StatusOptions
```ts
export interface StatusOptions {
  readonly [key: string]: unknown
}
```

## Contract Constraints

- Core must remain stateless
- No gateway-specific logic in core
- Callbacks are untrusted - only `verify()` creates `VerifiedPayment`
- Money uses decimal strings only (no floats)
- All verification must validate amount, order, signature
- Constant-time comparison for signatures
- Never log secrets
- This contract is FROZEN - do not modify without explicit instruction
