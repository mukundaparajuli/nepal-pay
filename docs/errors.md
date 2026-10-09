# Errors

Every error thrown by the SDK extends `NepalPaymentsError`, which carries a
machine-readable `code` and optional `details`.

```ts
import { NepalPaymentsError } from '@nepal-payments/core'

try {
  const payment = await gateway.verify(callback, { expected: order })
} catch (error) {
  if (error instanceof NepalPaymentsError) {
    console.error(error.name, error.code, error.message)
  }
}
```

Branch on `error.code`, not on `error.message` — messages are for humans and may
change.

## Classes

| Class                | Used for                                                   |
| -------------------- | ---------------------------------------------------------- |
| `NepalPaymentsError` | Base class; catch this to catch anything from the SDK      |
| `PaymentError`       | Invalid input, malformed callbacks, unsupported operations |
| `VerificationError`  | A callback/status failed a security check in `verify()`    |
| `ConfigurationError` | Bad gateway configuration (constructor/`createX`)          |
| `MoneyError`         | Invalid money construction or arithmetic                   |

## Code reference

### Input & configuration

| Code               | Meaning                                             | Typical fix                                          |
| ------------------ | --------------------------------------------------- | ---------------------------------------------------- |
| `INVALID_ORDER`    | Malformed order (e.g. non-string metadata value)    | Pass a plain `Record<string, string>` for metadata   |
| `INVALID_ORDER_ID` | Order id missing/empty/too long or bad chars        | Use 1–100 chars, alphanumeric/hyphens                |
| `INVALID_AMOUNT`   | Amount invalid, zero/negative, or unsupported       | Use `moneyFromDecimal('10.00')`, positive only       |
| `UNSAFE_AMOUNT`    | Amount exceeds `Number.MAX_SAFE_INTEGER` minor unit | Use a smaller amount; gateways cap the minor unit    |
| `INVALID_URL`      | A `return`/`success`/`failure`/`website` URL is bad | Pass an absolute `http(s)` URL                       |
| `INVALID_STATUS`   | Unknown status value or failed status transition    | Check gateway status spelling                        |
| `INVALID_TXN_REF`  | Transaction reference id/shape is invalid           | Use the id returned by `createCheckout`              |
| `INVALID_BASE64`   | Base64 payload could not be decoded                 | Ensure you forward the raw gateway payload unchanged |
| `NOT_IMPLEMENTED`  | Reserved for gateways that are not built yet        | ConnectIPS/Fonepay are not implemented               |

### Money

| Code                 | Meaning                                    |
| -------------------- | ------------------------------------------ |
| `INVALID_MONEY`      | Not a valid `Money` value                  |
| `INVALID_CURRENCY`   | Currency other than the supported `'NPR'`  |
| `INVALID_PRECISION`  | Precision outside the supported range      |
| `INVALID_DECIMAL`    | Decimal string could not be parsed exactly |
| `CURRENCY_MISMATCH`  | Combining money of different currencies    |
| `PRECISION_MISMATCH` | Combining money of different precision     |

### Callback & verification

| Code                  | Meaning                                               | Typical fix                                     |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `MALFORMED_CALLBACK`  | Callback payload missing/undecodable/not JSON         | Forward the full, unmodified query/body         |
| `GATEWAY_MISMATCH`    | Callback was verified with the wrong gateway adapter  | Use the adapter that created the checkout       |
| `SIGNATURE_MISMATCH`  | Signature missing or wrong (or secret mismatch)       | Check the secret; never recompute the signature |
| `AMOUNT_MISMATCH`     | Callback amount ≠ expected order amount               | Verify the order you pass as `expected`         |
| `ORDER_MISMATCH`      | Callback order id/product code ≠ expected order       | Look up the order by the transaction you stored |
| `UNKNOWN_TRANSACTION` | Gateway has no such transaction (or status disagrees) | Confirm the transaction id and environment      |

`verify()` also throws `VerificationError` without a code for transport-level
failures (e.g. a status lookup that returns malformed JSON); handle a missing
`code` defensively.

## Recommended HTTP mapping

```ts
function statusFor(error: unknown): number {
  if (error instanceof NepalPaymentsError) return 400 // bad/untrusted input
  return 500 // unexpected — log and investigate
}
```

## See also

- [Troubleshooting](./troubleshooting.md) — symptom-driven walkthroughs
- [Security](./security.md) — why verification fails closed
