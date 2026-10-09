# Security Model

## Trust boundaries

- Callbacks, webhook payloads, and query params are **untrusted**. They are
  honors surfaces: `parseCallback()` tags them as `UnverifiedCallback` and
  `gateway.data` must never be trusted until `verify()` has run.
- Only `verify()` may create a `VerifiedPayment`. Nothing else in the SDK
  produces one, and nothing in the public API accepts project-supplied payment
  objects in its place.
- Verify **gateway tag**, **order**, **amount**, and **signature** in that
  order, server side. Never trust a client redirect alone.
- Signatures and digests are always compared in constant time
  (`constantTimeCompare`, `verifySha256`, `verifyHmacSha256`).
- Secrets (merchant credentials, HMAC secrets) must never be logged and never
  flow into callback data or `raw`.

## The VerifiedPayment seal

`VerifiedPayment` carries a private `unique symbol` brand installed with
non-enumerable, non-writable, non-configurable descriptors; the object (and its
`amount`, `txnRef`, `verifiedAt`, and deep-cloned `raw`) is frozen and extra
input keys are dropped.

This seal protects against **accidents**:

- object spread / shallow copies drop the seal;
- JSON serialization + parse drops the seal (BigInt would otherwise break
  serialization anyway);
- type casts and object literals cannot produce it at compile time;
- a plain `obj[symbol] = true` stamp is rejected because its descriptors differ.

Known limitations (by design — the seal is a type/accident barrier, **not** a
cryptographic authenticity proof):

- The brand symbol is not exported, but it can be extracted at runtime from any
  genuine instance via `Object.getOwnPropertySymbols`. A caller who can execute
  arbitrary code in-process can then re-stamp a fake object with `Object.defineProperty`
  (exact descriptors) and it will pass `isVerifiedPayment`. Do not use the seal
  as an authorization boundary against in-process code.
- There is a **dual-copy caveat**: if two copies of `@nepal-payments/core` end
  up loaded (e.g. `src` alias + `dist`, or different versions), each has its
  own symbol. A payment sealed by copy A fails `isVerifiedPayment` (copy B) and
  vice versa. Keep a single copy of the package at runtime.

## JSON persistence and replays

- Persist a payment as `moneyToJSON(...)` + `isVerifiedPayment(...)` checks +
  your own record; on load it is data, not a sealed payment. Re-verify against
  the gateway (`status()` / `verify()`) before acting on it, and always compare
  the amount/order you stored with the one you retrieved.
- `verifiedAt` is set when `verify()` seals. Record `callbackFingerprint(...)`
  for each handled callback and refuse duplicates to mitigate replay of the
  same gateway notification.
- Compare amounts with `compareMoney`/`moneyEquals` across gateway precisions
  (e.g. NPR amounts reported as `1000.00` vs `1000` vs `1000.0`), not with
  float arithmetic.

## Order validation

`createOrder()` rejects empty/overlong ids, zero/negative amounts, and
non-`http(s)` URLs. Runtime adapters should wrap untrusted input in
`createOrder()` before calling `createCheckout()`.

## Server-side confirmation

Signature checks alone are not always enough. `verify()` additionally confirms
the transaction against the gateway before sealing:

- **eSewa** — a `COMPLETE` callback triggers the status API; `ref_id` must match
  `transaction_code` and the status must agree.
- **Khalti** — the lookup API must report the payment as successful; the
  redirect query is never trusted on its own.

Never replace `verify()` with a hand-rolled signature check, and never treat a
client redirect as proof of payment.

## Sandbox vs live

The `environment` option (`'sandbox' | 'production'`) selects the credential
set and default endpoints; overriding endpoints must match the credentials.
Treat sandbox credentials as real secrets; never ship sandbox or live
credentials in client code.

## See also

- [Errors](./errors.md) — verification failure codes
- [Troubleshooting](./troubleshooting.md) — symptom-driven diagnosis
- [Testing](./testing.md) — exercising the failure paths with the mock gateway
