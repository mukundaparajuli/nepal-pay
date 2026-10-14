# Khalti Payment Gateway (KPG-2) — Research Notes

## Status

Verified against the official documentation at https://docs.khalti.com/khalti-epayment
(Web Checkout, KPG-2) and live probes of the sandbox API. Implementation shipped
in `packages/khalti`.

## Sandbox Access

- Merchant signup: https://test-admin.khalti.com (`987654` as login OTP)
- Test Khalti IDs: `9800000000`–`9800000005`
- Test MPIN: `1111`
- Test OTP: `987654`
- Use the sandbox `live_secret_key` from the sandbox admin dashboard.

## Authentication

Every API call sends the secret key as an auth header:

```
Authorization: Key <secret_key>
```

No signing of payloads. Callbacks carry no signature either; the lookup API is
the authoritative confirmation step (docs: "Please use the lookup API for the
final validation of the transaction").

## API Endpoints

| Environment | Base API                         | Initiate              | Lookup              |
| ----------- | -------------------------------- | --------------------- | ------------------- |
| Sandbox     | `https://dev.khalti.com/api/v2/` | `/epayment/initiate/` | `/epayment/lookup/` |
| Production  | `https://khalti.com/api/v2/`     | `/epayment/initiate/` | `/epayment/lookup/` |

Both URLs are overridable in the config (`initiateUrl`, `lookupUrl`).

## Initiation (create checkout)

`POST /epayment/initiate/` with `Authorization: Key <secret_key>`.

| Field                                               | Required | Notes                                                             |
| --------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| `return_url`                                        | Yes      | Landing page after the transaction; must be a URL                 |
| `website_url`                                       | Yes      | Merchant website URL                                              |
| `amount`                                            | Yes      | Total payable amount in **paisa**; ≥ 1000 paisa (Rs. 10); integer |
| `purchase_order_id`                                 | Yes      | Merchant-generated unique identifier                              |
| `purchase_order_name`                               | Yes      | Product name                                                      |
| `customer_info`                                     | No       | `{name?, email?, phone?}` — who the txn is billed to              |
| `amount_breakdown`, `product_details`, `merchant_*` | No       | Extra labels / metadata                                           |

Success response:

```json
{
  "pidx": "bZQLD9wRVWo4CdESSfuSsB",
  "payment_url": "https://test-pay.khalti.com/?pidx=bZQLD9wRVWo4CdESSfuSsB",
  "expires_at": "2023-05-25T16:26:16.471649+05:45",
  "expires_in": 1800
}
```

- `pidx` is the stable identifier to "use for any future references".
- The user is redirected to `payment_url` (our checkout returns
  `{ type: 'redirect', url: payment_url }`; `txnRef.id` = `pidx`).
- Payment links expire in 60 minutes in production (sandbox example shows 1800s).

Error responses are shape-checked and surfaced (e.g. `Invalid token.`,
validation `error_key`).

## Callback (return_url redirect, GET)

The browser is redirected to `return_url` with query parameters:

| Param                                      | Notes                                      |
| ------------------------------------------ | ------------------------------------------ |
| `pidx`                                     | The initial payment identifier; required   |
| `status`                                   | `Completed`, `Pending`, or `User canceled` |
| `transaction_id`, `tidx`, `txnId`          | Khalti transaction id (same value)         |
| `amount`, `total_amount`                   | Amount paid, in paisa                      |
| `mobile`                                   | Payer Khalti ID                            |
| `purchase_order_id`, `purchase_order_name` | Echoed from initiation                     |

Sample success callback:

```
?pidx=...&status=Completed&transaction_id=4H7AhoXDJWg5WjrcPT9ixW
&amount=1000&total_amount=1000&mobile=98XXXXX904
&purchase_order_id=test12&purchase_order_name=test
```

- `parseCallback` requires a non-empty `pidx`; message-only failure redirects
  (`?message=...`) carry no transaction data and are rejected as
  `MALFORMED_CALLBACK`.
- Khalti does not sign callbacks. A callback alone is **never** a sealable
  `VerifiedPayment`; `verify()` always cross-checks the lookup API.

## Lookup (payment verification)

`POST /epayment/lookup/` with `Authorization: Key <secret_key>` and body
`{"pidx": "..."}`.

Response:

```json
{
  "pidx": "HT6o6PEZRWFJ5ygavzHWd5",
  "total_amount": 1000,
  "status": "Completed",
  "transaction_id": "GFq9PFS7b2iYvL8Lir9oXe",
  "fee": 0,
  "refunded": false
}
```

Important nuance: `Expired` and `User canceled` responses arrive with **HTTP 400
but a normal payload body**. Our `queryLookup` therefore parses the body first
and only treats a `{"detail": ...}` body (or malformed/unreadable JSON) as an
error. `{"detail":"Not found."}` for an unknown pidx → `UNKNOWN_TRANSACTION`;
`{"detail":"Invalid token."}` / credentials error (HTTP 401) → `INVALID_STATUS`.

### Statuses and mapping

| Khalti status        | HTTP code | SDK `PaymentStatus` |
| -------------------- | --------- | ------------------- |
| `Completed`          | 200       | `completed`         |
| `Pending`            | 200       | `pending`           |
| `Initiated`          | 200       | `pending`           |
| `User canceled`      | 400       | `canceled`          |
| `Expired`            | 400       | `expired`           |
| `Refunded`           | 200       | `unknown`           |
| `Partially Refunded` | 200       | `unknown`           |

Only `Completed` should be treated as success ("Provide service to user").
`Refunded`/`Partially Refunded` map to `unknown` (consistent with eSewa) because
the unified SDK status set has no refunded state.

## Verification flow (verify)

`callback → lookup API → amount → order → status → VerifiedPayment`:

1. Gateway must be `khalti`, and the callback must carry a non-empty `pidx`.
2. Lookup the transaction by `pidx` (server-side truth; authoritative status).
3. Amount: callback `amount`/`total_amount` (paisa) must equal the expected
   order amount, **and** the lookup `total_amount` must match too — a forged
   callback amount cannot outrank the lookup.
4. Order: callback `purchase_order_id` must equal `order.id`; a
   `purchase_order_id` in the lookup (when present) is checked as well.
5. Status comes from the **lookup**, not the callback. A `Completed`-claiming
   callback with an `Expired`/`User canceled`/`Pending` lookup seals the lower
   status. A completed lookup requires a non-empty `transaction_id`.
6. The sealed `VerifiedPayment` carries `txnRef = { id: pidx, gateway: 'khalti' }`
   so the transaction can be re-looked-up later; `transaction_id` is kept in
   `raw.lookup`.

## Security model

- Only `verify()` creates `VerifiedPayment`; `parseCallback` never does.
- Lookup API is the final judge of status and amount — callbacks are untrusted.
- `status(txnRef)` re-queries the lookup API by `pidx` and, with an `expected`
  order, re-verifies amount and order id.
- Secret key is sent only in the `Authorization` header and never appears in
  errors or fixtures. Request timeouts abort via `AbortController`.

## Sources

- Official docs, Web Checkout (KPG-2): https://docs.khalti.com/khalti-epayment
  (and its source repository `khalti/docs.khalti.com`)
- Live sandbox probes (2026-10-08) captured in `tests/fixtures/khalti/`
