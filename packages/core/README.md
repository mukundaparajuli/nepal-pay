# @nepal-payments/core

Core types, exact `Money` arithmetic, orders, callbacks, and the `GatewayAdapter`
contract shared by the Nepal Payments SDK.

- Money is exact — `bigint` minor units, never floating point.
- Framework-agnostic and stateless: no DB, no session, no framework dependency.
- Callbacks are untrusted; gateways seal a `VerifiedPayment` only from `verify()`.

## Install

```bash
pnpm add @nepal-payments/core
```

## Usage

```ts
import { createOrder, moneyFromDecimal } from '@nepal-payments/core'

const order = createOrder({
  id: 'ORDER-1001',
  amount: moneyFromDecimal('100.00'),
})
```

Amounts are exact decimal strings via `moneyFromDecimal` — never pass a float.

## Links

- [Full quickstart](https://github.com/mukundaparajuli/nepal-payments#readme)
- [Architecture](https://github.com/mukundaparajuli/nepal-payments/blob/main/docs/architecture.md)
- [Security](https://github.com/mukundaparajuli/nepal-payments/blob/main/docs/security.md)

## License

MIT
