# @nepal-payments/fonepay

Fonepay integration (GET-redirect checkout + HMAC-SHA512 DV verification) for the
Nepal Payments SDK.

## Install

```bash
pnpm add @nepal-payments/core @nepal-payments/fonepay
```

## Usage

```ts
import { createFonepay } from '@nepal-payments/fonepay'

const gateway = createFonepay({
  merchantCode: process.env.FONEPAY_PID!,
  secretKey: process.env.FONEPAY_SECRET_KEY!,
  environment: 'sandbox', // 'sandbox' | 'production'
  returnUrl: 'https://example.com/payments/callback',
})

const { checkout } = await gateway.createCheckout(order)
// checkout.type === 'redirect' — send the browser to checkout.url
```

Fonepay checkout is a `redirect`. On the callback, call
`gateway.parseCallback()` then `gateway.verify()` — `verify()` recomputes the
response DV (HMAC-SHA512) and, by default (`serverVerification: true`), confirms
the transaction with Fonepay before sealing a `VerifiedPayment`.

## Links

- [Fonepay guide](https://github.com/mukundaparajuli/nepal-payments/blob/main/docs/fonepay.md)
- [Protocol research](https://github.com/mukundaparajuli/nepal-payments/blob/main/docs/research/fonepay.md)
- [Full quickstart](https://github.com/mukundaparajuli/nepal-payments#readme)

## License

MIT
