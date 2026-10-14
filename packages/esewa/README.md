# @nepal-payments/esewa

eSewa ePay V2 integration (form POST checkout) for the Nepal Payments SDK.

## Install

```bash
pnpm add @nepal-payments/core @nepal-payments/esewa
```

## Usage

```ts
import { createEsewa } from '@nepal-payments/esewa'

const gateway = createEsewa({
  merchantCode: process.env.ESEWA_MERCHANT_CODE!,
  secret: process.env.ESEWA_SECRET!,
  environment: 'sandbox', // 'sandbox' | 'production'
  successUrl: 'https://example.com/payments/success',
  failureUrl: 'https://example.com/payments/failure',
})

const { checkout } = await gateway.createCheckout(order)
// checkout.type === 'form_post'
// Render checkout.formParams as hidden inputs and submit to checkout.url.
```

eSewa checkout is a `form_post`: render the returned fields as a hidden form and
submit it to `checkout.url`. On the callback, call `gateway.parseCallback()`
then `gateway.verify()` — `verify()` confirms against the eSewa status API
before sealing a `VerifiedPayment`.

## Links

- [eSewa guide](https://github.com/mukundaparajuli/nepal-payments/blob/main/docs/esewa.md)
- [Full quickstart](https://github.com/mukundaparajuli/nepal-payments#readme)

## License

MIT
