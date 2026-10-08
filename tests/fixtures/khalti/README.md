# Khalti (KPG-2) fixtures

Provenance for every fixture in this directory.

## Live captures (curl, 2026-10-08, against `https://dev.khalti.com`)

Sandbox reachability and server-side error bodies are verified against the real
API. No valid sandbox merchant credentials were available in this environment,
so these captures use a deliberately invalid key (`test_secret_key_probe`) and
no key at all. All four probes returned HTTP 401 as documented:

- `initiate-401-invalid-token.json` — initiate without a valid key
  → `{"detail":"Invalid token.","status_code":401}`
- `initiate-401-credentials.json` — initiate without an Authorization header
  → `{"detail":"Authentication credentials were not provided.","status_code":401}`
- `lookup-401-invalid-token.json` — lookup without a valid key
  → `{"detail":"Invalid token.","status_code":401}`

## Docs-derived (official documentation)

`https://docs.khalti.com/khalti-epayment` (Web Checkout, KPG-2) is the source
for the success shape of every flow. These fixtures reflect the documented
payloads and mark the documented drift:

- `initiate-success.json` — initiate success: `pidx`, `payment_url`,
  `expires_at`, `expires_in`. Note a payment link expires in 60 minutes in
  production (the sandbox example shows `expires_in: 1800`).
- `callback-completed.json` — success callback query. Callback carries `pidx`,
  `status`, `transaction_id`/`tidx`/`txnId`, `amount` and `total_amount` (paisa),
  `mobile`, `purchase_order_id`, `purchase_order_name`. Khalti does not sign the
  callback; the lookup API is the authoritative final validation.
- `callback-user-canceled.json` — canceled callback (`status=User canceled`).
- `lookup-completed.json`, `lookup-pending.json`, `lookup-initiated.json`,
  `lookup-expired.json`, `lookup-refunded.json`, `lookup-user-canceled.json` —
  documented lookup responses. Only `Completed` must be treated as success.
- `lookup-400-not-found.json` — documented error for an unknown pidx
  → `{"detail":"Not found.","error_key":"validation_error"}` (HTTP 400).
  Our `queryLookup` maps this to `UNKNOWN_TRANSACTION`.

Important nuance captured in `status.ts`: `Expired` and `User canceled` lookups
arrive with HTTP 400 **but a normal payload body**, so the SDK parses the body
first and only treats a `{"detail": ...}` body (or unreadable/malformed JSON) as
an error.

## Status mapping to the SDK's unified status set

| Khalti status        | SDK `PaymentStatus` |
| -------------------- | ------------------- |
| `Completed`          | `completed`         |
| `Pending`            | `pending`           |
| `Initiated`          | `pending`           |
| `User canceled`      | `canceled`          |
| `Expired`            | `expired`           |
| `Refunded`           | `unknown`           |
| `Partially Refunded` | `unknown`           |

`Refunded`/`Partially Refunded` map to `unknown` (consistent with eSewa) because
the SDK's unified status set has no refunded state and only `Completed` may
fulfill an order.

## E2E harness

`harness.mjs` runs the automatable E2E steps. The payment itself must be
completed manually in the opened `payment_url` (sandbox: Khalti ID
e.g. `9800000000`, MPIN `1111`, OTP `987654`). With a valid sandbox secret key
from `test-admin.khalti.com` it:

1. creates (initiates) the payment and saves `captures/e2e-initiate.json`
2. prints the redirect `payment_url`
3. starts a local HTTP server to receive the callback and saves
   `captures/e2e-callback.json`
4. performs the lookup and saves `captures/e2e-lookup.json`

Run it with `KHALTI_SECRET_KEY=... node harness.mjs`.
