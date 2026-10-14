# @nepal-payments/mock

In-memory payment gateway for testing the Nepal Payments SDK without real
credentials or network calls.

## Install

```bash
pnpm add -D @nepal-payments/core @nepal-payments/mock
```

## Usage

```ts
import { createMockGateway } from '@nepal-payments/mock'

const gateway = createMockGateway({ secretKey: 'dev-secret' })

const { txnRef } = await gateway.createCheckout(order)
await gateway.pay(txnRef) // simulate the payer
const raw = await gateway.generateCallback(txnRef)

const payment = await gateway.verify(gateway.parseCallback(raw), {
  expected: order,
})
```

Scenario controls: `pay`, `settle`, `expire`, `setStatus`, and `generateCallback`
let you exercise success, pending, failed, expired, duplicate, timeout, and
invalid-signature flows deterministically.

## Links

- [Testing guide](https://github.com/mukundaparajuli/nepal-payments/blob/main/docs/testing.md)
- [Full quickstart](https://github.com/mukundaparajuli/nepal-payments#readme)

## License

MIT
