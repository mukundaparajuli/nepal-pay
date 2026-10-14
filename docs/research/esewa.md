# eSewa Payment Gateway (ePay V2)

This document records what was verified against eSewa's UAT environment and
official/community documentation while implementing `@nepal-payments/esewa`.

## Status

Research verified against live UAT where noted. Anything not live-verified is
explicitly marked as docs-derived.

## Flow

eSewa ePay V2 is a **form POST** flow (no server-side initiation API):

1. Merchant renders a hidden HTML form that POSTs to the eSewa form endpoint.
2. eSewa collects the customer's payment and redirects the browser back to
   `success_url` (also set per request) with `?data=<base64 of JSON>`.
   Failures redirect to `failure_url`.
3. The merchant verifies the callback server-side (signature + amount + order),
   then confirms against the **transaction status API** before sealing a payment.

## Endpoints

| Purpose                    | Sandbox (UAT)                                               | Production                                               |
| -------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| Payment form (POST target) | `https://rc-epay.esewa.com.np/api/epay/main/v2/form`        | `https://epay.esewa.com.np/api/epay/main/v2/form`        |
| Transaction status (GET)   | `https://rc-epay.esewa.com.np/api/epay/transaction/status/` | `https://epay.esewa.com.np/api/epay/transaction/status/` |

> URL drift: one official doc page lists the production status URL as
> `https://esewa.com.np/api/epay/transaction/status/` while the canonical
> `epay.esewa.com.np` host (confirmed working for the payment form) is used
> here. The endpoints are configurable (`checkoutFormUrl`, `statusCheckUrl`)
> so any future drift can be overridden without a code change.
>
> Live-verified: GET `https://rc-epay.esewa.com.np/api/epay/transaction/status/?product_code=EPAYTEST&total_amount=100&transaction_uuid=<uuid>`
> returns HTTP 200 with a JSON body. Example captured fixture:
> `{"product_code":"EPAYTEST","transaction_uuid":"...","total_amount":100.0,"status":"NOT_FOUND","ref_id":null}`.

## Sandbox credentials (UAT)

- Product code: `EPAYTEST`
- Secret key: `8gBm/:&EnhH.1/q`

## Checkout form fields

POST (application/x-www-form-urlencoded) to the payment form URL:

| Field                     | Meaning                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `amount`                  | Amount payable by the customer = `total_amount - tax_amount - product_service_charge - product_delivery_charge` |
| `tax_amount`              | Tax amount (default `0`)                                                                                        |
| `product_service_charge`  | Service charge (default `0`)                                                                                    |
| `product_delivery_charge` | Delivery charge (default `0`)                                                                                   |
| `total_amount`            | Grand total the customer pays                                                                                   |
| `transaction_uuid`        | Unique id for this payment attempt (alphanumeric + hyphens allowed)                                             |
| `product_code`            | Merchant product code (`EPAYTEST` in UAT)                                                                       |
| `success_url`             | Redirect URL on success (receives `?data=`)                                                                     |
| `failure_url`             | Redirect URL on failure                                                                                         |
| `signed_field_names`      | Fields covered by `signature`, as comma-separated names                                                         |
| `signature`               | HMAC-SHA256 over the signed fields (see below)                                                                  |

For checkout, `signed_field_names = total_amount,transaction_uuid,product_code`.

## Signing

`signature` is the Base64 encoding of **HMAC-SHA256** over a message built from
the signed fields in `signed_field_names` order:

```
message = "total_amount=<amount>,transaction_uuid=<uuid>,product_code=<code>"
signature = base64( hmac_sha256( message, merchantSecret ) )
```

Verified vector (reproduces with the algorithm above and the UAT secret):

```
message:  total_amount=110,transaction_uuid=241028,product_code=EPAYTEST
secret:   8gBm/:&EnhH.1/q
signature: i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME=
```

> The older published send example
> (`total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST` →
> `4Ov7pCI1zIOdwtV2BRMUNjz1upIlT/COTxfLhWvVurE=`) and the published callback
> examples do **not** reproduce with the current UAT secret — the examples are
> believed to be stale (generated under an older key). Do not assert them in
> tests.

## Callback

On success eSewa redirects to `success_url?data=<base64>` where `data` decodes
to JSON (example from official docs):

```json
{
  "status": "COMPLETE",
  "signature": "ApAgFaOH8B1900oTI62Il9Gvl5C6Y87M0W6a1lRrK10=",
  "transaction_code": "0004T5I",
  "total_amount": 230,
  "transaction_uuid": "12-6-23",
  "product_code": "EPAYTEST",
  "success_url": "https://esewa.com.np",
  "signed_field_names": "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names"
}
```

The callback message is built from the payload's own `signed_field_names`
(order included), e.g.:

```
transaction_code=0004T5I,status=COMPLETE,total_amount=230,transaction_uuid=12-6-23,product_code=EPAYTEST,signed_field_names=transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names
```

Notes:

- Numeric literals are preserved as written (`230` vs `230.0`); the signature
  must be computed over the raw literals, not a re-serialized number.
- The `signature` field is never part of `signed_field_names`.

## Status API

GET with query params `product_code`, `total_amount`, `transaction_uuid`:

```
https://rc-epay.esewa.com.np/api/epay/transaction/status/?product_code=EPAYTEST&total_amount=100&transaction_uuid=<uuid>
```

Response JSON:

```json
{
  "product_code": "EPAYTEST",
  "transaction_uuid": "123",
  "total_amount": 100.0,
  "status": "COMPLETE",
  "ref_id": "0007G36"
}
```

`ref_id` on a COMPLETE transaction equals the callback `transaction_code`.

Documented status values (docs-derived): `COMPLETE`, `PENDING`, `CANCELED`,
`NOT_FOUND`, `FULL_REFUND`, `PARTIAL_REFUND` (community sources also list
`RECHECKING`). Mapping to `PaymentStatus`:

| eSewa status                     | PaymentStatus | Notes                                     |
| -------------------------------- | ------------- | ----------------------------------------- |
| `COMPLETE`                       | `completed`   | only when server-side status confirms     |
| `PENDING`                        | `pending`     |                                           |
| `CANCELED`                       | `canceled`    |                                           |
| `NOT_FOUND`                      | `unknown`     |                                           |
| `FULL_REFUND` / `PARTIAL_REFUND` | `unknown`     | no `refunded` value in the SDK status set |
| anything else                    | `unknown`     |                                           |

## Security model

- Callbacks are untrusted: `parseCallback` only produces `UnverifiedCallback`.
- `verify()` is the only path that seals a `VerifiedPayment`; it checks, in
  order: gateway, callback signature (constant-time), `status`, amount vs the
  expected order, `transaction_uuid` vs the expected order id, `product_code`
  vs the configured merchant code, then a server-side status API confirmation.
- On a signed `COMPLETE` callback, a server response of `NOT_FOUND` (or any
  non-`COMPLETE`) is treated as fraud/inconsistency and rejected.
- Replay protection (idempotency by `transaction_code`) is the merchant's
  responsibility — eSewa provides no nonce field. See `docs/security.md`.
- Secrets must never be logged.

## Sources

- Official eSewa developer docs (Ep "Epay V2", "Epay", "Status", "Transaction
  Status" pages): https://developer.esewa.com.np/
- Diwas Atreya `esewa-api-wrapper` (TS, UAT-tested): current official signing
  format, https://github.com/diwasatreya/esewa-api-wrapper
- Sudip `esewa-sdk-php` (PHP, UAT-tested): endpoint resolution, checkout
  payload, callback verification, https://github.com/sudiptpa/esewa-sdk-php
