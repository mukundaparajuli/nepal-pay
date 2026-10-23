# Nepal Pay

A stateless TypeScript SDK for eSewa, Khalti, connectIPS, and Fonepay. Amounts
use exact `bigint` minor units, every gateway shares one adapter contract, and a
deterministic mock gateway covers tests and local development.

[Documentation](https://nepal-payments.vercel.app/docs/) |
[Quickstart](https://nepal-payments.vercel.app/docs/getting-started/quickstart/)

## Install

```bash
pnpm add @nepal-pay/core @nepal-pay/esewa
```

Add one gateway package per provider. The mock package needs no credentials.

## Example

```ts
import { createOrder, moneyFromDecimal } from '@nepal-pay/core'
import { createEsewa } from '@nepal-pay/esewa'

const gateway = createEsewa({
  merchantCode: process.env.ESEWA_MERCHANT_CODE!,
  secret: process.env.ESEWA_SECRET!,
  environment: 'sandbox',
  successUrl: 'https://example.com/payments/success',
  failureUrl: 'https://example.com/payments/failure',
})

const order = createOrder({
  id: 'ORDER-1001',
  amount: moneyFromDecimal('100.00'),
})

const { checkout, txnRef } = await gateway.createCheckout(order)

const callback = gateway.parseCallback({ query: req.query })
const payment = await gateway.verify(callback, { expected: order })

if (payment.status === 'completed') {
  await fulfillOnce(payment.orderId)
}
```

## Packages

- `@nepal-pay/core`: types, money, orders, errors, adapter contract
- `@nepal-pay/esewa`: eSewa ePay V2
- `@nepal-pay/khalti`: Khalti ePayment
- `@nepal-pay/connectips`: NCHL connectIPS
- `@nepal-pay/fonepay`: Fonepay
- `@nepal-pay/mock`: deterministic in-memory gateway
- `@nepal-pay/cli`: `npay` setup and smoke-test tooling

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm docs:dev
```

## License

MIT
