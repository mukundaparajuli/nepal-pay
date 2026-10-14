# @nepal-payments/connectips

NCHL connectIPS integration (form POST checkout + server-side validation) for
the Nepal Payments SDK.

## Install

```bash
pnpm add @nepal-payments/core @nepal-payments/connectips
```

## Usage

```ts
import { createConnectIps } from '@nepal-payments/connectips'

const gateway = createConnectIps({
  merchantId: process.env.CONNECTIPS_MERCHANT_ID!,
  appId: process.env.CONNECTIPS_APP_ID!,
  appName: process.env.CONNECTIPS_APP_NAME!,
  password: process.env.CONNECTIPS_PASSWORD!,
  privateKey: process.env.CONNECTIPS_PRIVATE_KEY_PEM!, // PKCS#8 PEM
  environment: 'sandbox', // 'sandbox' | 'production'
})

const { checkout } = await gateway.createCheckout(order)
// checkout.type === 'form_post'
// Render checkout.formParams as hidden inputs and submit to checkout.url.
```

connectIPS checkout is a `form_post`. On the callback, call
`gateway.parseCallback()` then `gateway.verify()` — `verify()` signs a
`validatetxn` request and confirms the transaction server-side before sealing a
`VerifiedPayment`.

## Preparing the key

NCHL issues an RSA credential as a PKCS#12 (`.pfx`) archive, which WebCrypto
cannot read. Convert it once to PKCS#8 with the CLI:

```bash
npay connectips import-pfx ./CREDITOR.pfx --out ./creditor.key
# password is read from NPAY_PFX_PASSWORD or --password-stdin, never argv
```

Or call `pfxToPkcs8Pem()` from the Node-only `@nepal-payments/connectips/pfx`
subpath. Browser bundles never pull in `node-forge`.

## Links

- [connectIPS guide](https://github.com/mukundaparajuli/nepal-payments/blob/main/docs/connectips.md)
- [Protocol research](https://github.com/mukundaparajuli/nepal-payments/blob/main/docs/research/connectips.md)
- [Full quickstart](https://github.com/mukundaparajuli/nepal-payments#readme)

## License

MIT
