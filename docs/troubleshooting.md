# Troubleshooting

Symptom-driven answers for the most common integration issues. Each section
starts with the question, then the likely causes, how to confirm, and the fix.

Related: [Errors](./errors.md) · [Security](./security.md) ·
[eSewa](./esewa.md) · [Khalti](./khalti.md).

---

## Why is my payment `UNKNOWN`?

`status` becomes `'unknown'` when the gateway reports a state the SDK does not
map to a real payment outcome.

**Likely causes**

- A refund state (`eSewa` `FULL_REFUND` / `PARTIAL_REFUND`, `Khalti` `Refunded`).
- `eSewa` `NOT_FOUND` — the status API has no such transaction.
- A raw status string the SDK does not recognize (typo, a new/changed code).

**Confirm**

```ts
const payment = await gateway.status(txnRef, { expected: order })
console.log(payment.status, payment.raw) // inspect the raw gateway payload
```

**Fix**

- Never fulfill on `'unknown'`. Treat it as "reconcile manually".
- For refunds, handle them as a separate business process — the SDK reports the
  payment outcome, not refunds.
- If you expect `completed` but see `unknown`, you are probably querying the
  wrong environment or the transaction id is from a different gateway.

---

## Why did callback verification fail?

`verify()` throws a `VerificationError`. Read `error.code`:

| Code                  | Cause                                                                          |
| --------------------- | ------------------------------------------------------------------------------ |
| `GATEWAY_MISMATCH`    | You verified with the wrong adapter (eSewa callback on a Khalti gateway, etc.) |
| `MALFORMED_CALLBACK`  | The payload is missing, not decodable, or not the shape the gateway sends      |
| `SIGNATURE_MISMATCH`  | Missing/wrong signature — usually the wrong `secret`                           |
| `ORDER_MISMATCH`      | The callback's order id / product code ≠ the `expected` order you passed       |
| `AMOUNT_MISMATCH`     | The callback amount ≠ `expected.amount` (see the next section)                 |
| `UNKNOWN_TRANSACTION` | The gateway has no matching transaction (status API disagrees / wrong env)     |

**Most common mistakes**

1. **Modifying the payload.** Do not decode, re-encode, trim, or rebuild the
   callback. Forward the raw query/body to `parseCallback`. For eSewa that means
   passing `{ query: req.query }` so `data` is offered untouched.
2. **Wrong secret.** Sandbox and production secrets differ. Signature checks
   fail closed — a mismatch is a real mismatch, not a "retry".
3. **Wrong `expected` order.** Look up the order by the transaction id you
   persisted at checkout time, not by anything in the callback.

**Confirm**

```ts
try {
  const payment = await gateway.verify(callback, { expected: order })
} catch (error) {
  if (error instanceof NepalPaymentsError) {
    console.error(error.code, error.details)
  }
}
```

---

## Why does the amount mismatch?

`AMOUNT_MISMATCH` means the amount in the callback (or the gateway's status API)
does not equal `expected.amount`.

**Likely causes**

- **The wrong order.** `expected` is not the order this transaction belongs to.
  Always resolve the order from the `txnRef.id → order.id` mapping you stored.
- **Surcharges.** For eSewa, `tax`/`serviceCharge`/`deliveryCharge` are subtracted
  from the order total to form `amount`; `total_amount` stays the full order
  amount. Confirm you compared against the order total, not a component.
- **Units.** Khalti amounts are in **paisa**; `moneyFromDecimal('100.00')` is the
  rupee amount. The SDK converts, so this only bites if you hand-built amounts.
- **A different currency/precision** created through `createMoney` rather than
  `moneyFromDecimal`.

**Confirm**

```ts
import { moneyToDecimal } from '@nepal-payments/core'

console.log(moneyToDecimal(order.amount)) // e.g. '100.00'
console.log(String(callback.data.total_amount)) // what the gateway sent
```

**Fix** — pass the exact `Order` you created (and stored) as `expected`.
`moneyEquals` already treats `100` and `100.00` as equal, so a mismatch is a
genuinely different value.

---

## Why did the status lookup fail?

`verify()` (eSewa `COMPLETE`) and `status()` call the gateway's status API. A
failure here surfaces as `VerificationError`, `INVALID_STATUS`, or
`UNKNOWN_TRANSACTION`.

**Likely causes**

- **Transport.** Network failure or timeout (`timeoutMs`, default `10000`).
- **Non-OK HTTP.** Bad credentials, wrong endpoint, or wrong environment.
- **Malformed response.** A proxy or captive portal returned HTML/JSON that is
  not the expected shape (thrown without a `code`).
- **Not found.** eSewa returns `NOT_FOUND` → `UNKNOWN_TRANSACTION`; the
  transaction may have been created in another environment.

**Confirm**

- Log the environment and the endpoint being used (never the secret).
- Inject a `fetch` to trace requests:

```ts
const gateway = createEsewa({
  /* ... */
  environment: 'sandbox',
  fetch: async (input, init) => {
    console.log('→', input) // never log init.headers (contains secrets)
    return fetch(input, init)
  },
})
```

**Fix** — match environment and credentials, raise `timeoutMs` for slow
networks, and make sure your server can reach the gateway. Remember that this
lookup is the security boundary: do not skip it, do not swallow its errors.

---

## Why did my sandbox payment not complete?

You reached the callback but the payment never becomes `completed`.

**Likely causes**

- **Environment/credential mix.** Using a production `secret`/`merchantCode`
  against the sandbox endpoints (or vice versa). The SDK defaults endpoints from
  `environment`; if you overrode `checkoutFormUrl`/`statusCheckUrl` (or
  `initiateUrl`/`lookupUrl`), make sure they match the credentials.
- **The flow was not finished.** A sandbox payment only completes after the
  tester actually completes the login/payment at the gateway. Abandoning the
  page leaves it `pending`.
- **Status agrees only for the right transaction.** eSewa `COMPLETE` verification
  requires the status API to return the **same** `product_code`,
  `transaction_uuid`, and amount; otherwise it throws.
- **Khalti always re-checks.** Khalti `verify()` requires the lookup API to
  report success — a successful-looking redirect is not enough.

**Confirm**

- Query the gateway directly with the returned `txnRef`:

```ts
const payment = await gateway.status(txnRef, { expected: order })
console.log(payment.status, payment.raw)
```

- eSewa sandbox: use the sandbox `merchantCode`/`secret` with
  `environment: 'sandbox'`.
- Khalti sandbox: use the sandbox secret key from the merchant dashboard with
  `environment: 'sandbox'`.

**Fix** — align environment + credentials + endpoints, and complete the payment
flow end to end. If you are building tests, use the
[mock gateway](./testing.md) instead of the real sandbox.

---

## Duplicate callbacks and reachability

- **Callbacks can repeat** (and providers retry). Make fulfillment idempotent —
  guard on a unique order/payment id at the database level.
- **The result is only as good as your `expected`.** If your order lookup fails,
  `verify()` fails closed. Persist orders and the txn→order mapping before you
  redirect the customer.
- **`payment.raw` is safe to log** (no secrets) and helps diagnose disagreements,
  but it is a frozen clone — persist what you need elsewhere, since the seal is
  lost through JSON round-trips.
