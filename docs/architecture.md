# Architecture Design

## Principles

- **Stateless by default**: No internal state, no sessions, no database dependencies
- **Web APIs where possible**: Focus on HTTP-based integrations, no framework lock-in
- **No framework dependency in core**: Core is pure TypeScript/JavaScript with no external deps
- **No database dependency**: Everything passed in/returned out
- **No floating point money**: All monetary values as decimal strings (e.g., "1000.00")
- **No gateway-specific logic in core**: Core defines abstractions only

## Design Philosophy

Based on research of the four gateways (eSewa, Khalti, ConnectIPS, Fonepay), they share common patterns but differ in implementation:

- Some use form redirects (eSewa, Fonepay), others use REST API + redirect (Khalti, ConnectIPS)
- All require signature/HMAC verification
- All need server-side verification of callbacks
- All require amount and order validation

## Core Abstractions

### Money

Represent money as `{ amount: string, currency: 'NPR' }` to avoid floating point precision issues.

### PaymentRequest

Minimal common fields across all gateways:

- orderId: unique identifier (merchant-controlled)
- amount: Money
- productName/productDescription
- customer info (optional)
- returnUrl, failureUrl (user redirect)
- callbackUrl (server-to-server, optional)
- metadata (gateway-agnostic extra data)

### PaymentResponse

Common response from initiating payment:

- paymentUrl: URL to redirect user to complete payment
- transactionId: gateway's transaction ID if returned
- raw: gateway-specific response for debugging (never logged with secrets)

### CallbackPayload

Generic key-value map for callback data - treated as untrusted input. Core never interprets it.

### VerifiedPayment

Only created by `verify()` after successful validation:

- orderId, transactionId
- amount (verified)
- status
- method (gateway type)
- raw (original payload)

### PaymentGateway Interface

```ts
interface PaymentGateway {
  readonly name: PaymentMethod
  initiate(request: PaymentRequest): Promise<PaymentResponse>
  verify(
    payload: CallbackPayload,
    options?: VerifyOptions
  ): Promise<VerifiedPayment>
}
```

This is the smallest common abstraction. All gateway-specific details (signature generation, parameter names, API endpoints, data transformation) are encapsulated in each gateway implementation. Core provides types, utilities (constant-time compare, money formatting), and errors.

## Security Model

- **Callbacks are untrusted**: Never trust payload without verify()
- **Only verify() creates VerifiedPayment**: Single point of trust creation
- **Verify amount, order, signature**: All three must pass
- **Server-side status verification**: When in doubt, verify via status API
- **Constant-time signature comparison**: Prevent timing attacks
- **Never log secrets**: Core/utils enforce this principle

## Extensibility

Adding ConnectIPS/Fonepay later means implementing PaymentGateway interface with their specific logic - no core changes needed. This matches "stateless" and "no gateway-specific logic in core".
