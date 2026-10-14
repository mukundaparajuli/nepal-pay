# @nepal-payments/khalti

Khalti ePayment integration (REST redirect checkout) for the Nepal Payments SDK.

## Install

```bash
pnpm add @nepal-payments/core @nepal-payments/khalti
```

## Usage

```ts
import { createKhalti } from '@nepal-payments/khalti'

const gateway = createKhalti({
  secretKey: process.env.KHALTI_SECRET_KEY!,
  environment: 'sandbox', // 'sandbox' | 'production'
  returnUrl: 'https://example.com/payments/callback',
  websiteUrl: 'https://example.com',
})

const { checkout } = await gateway.createCheckout(order)
// checkout.type === 'redirect'
if (checkout.type === 'redirect') res.redirect(checkout.url)
```

Khalti checkout is a `redirect`: send the browser to `checkout.url`. On the
callback, call `gateway.parseCallback()` then `gateway.verify()` —
`verify()` performs a server-side lookup before sealing a `VerifiedPayment`.

## Links

- [Khalti guide](https://github.com/mukundaparajuli/nepal-payments/blob/main/docs/khalti.md)
- [Full quickstart](https://github.com/mukundaparajuli/nepal-payments#readme)

## License

MIT
