# Security Review

An adversarial review of the SDK's central claim: **an unpaid (or failed) order
can never become a `completed` payment.** This report records the attacks that
were attempted, the evidence for each, and the residual risks that remain.

The design itself is documented in [security.md](./security.md); this file is the
audit that exercises it.

## Scope and method

- Reviewed the whole repository: `packages/*`, `apps/*`, `tests/*`, CI
  workflows, and the `npay` CLI.
- Threat model: the attacker fully controls callback payloads, query params, and
  webhook bodies, and may execute code inside the merchant process. They do
  **not** hold the merchant secret key, the gateway's RSA private key, or
  database write access.
- Method: code inspection plus executable tests. Reproduce with
  `pnpm test` and, for the two entry-points added by this review,
  `pnpm exec vitest run tests/security` and `pnpm exec vitest run tests/mock/security.test.ts`.

## Attack matrix

| #   | Attack                                                                                  | Expected result                                     | Evidence                                                                                     |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Forge a callback signed with an attacker-controlled secret                              | `SIGNATURE_MISMATCH`                                | `tests/esewa/security.test.ts`, `tests/mock/security.test.ts`, conformance suite per gateway |
| 2   | Tamper the amount / order id / status / product code after signing                      | `SIGNATURE_MISMATCH`                                | `tests/esewa/security.test.ts`, `tests/mock/security.test.ts`                                |
| 3   | Reuse a callback for a different order                                                  | `ORDER_MISMATCH`                                    | per-gateway `verify.test.ts`                                                                 |
| 4   | Send a malformed / non-JSON callback                                                    | `MALFORMED_CALLBACK`                                | per-gateway `callback.test.ts`                                                               |
| 5   | Point the status API at a lie / disagreed status                                        | `UNKNOWN_TRANSACTION` or sealed to gateway truth    | `tests/esewa/security.test.ts`, `tests/mock/security.test.ts`                                |
| 6   | Hand-build an object with `status: 'completed'` and persist it                          | not a `VerifiedPayment`; `UNVERIFIED_PAYMENT`       | `tests/security/unpaid-order.test.ts`                                                        |
| 7   | Copy a genuine sealed payment with spread, or re-stamp the brand with `Symbol.for(...)` | rejected by `isVerifiedPayment`                     | `tests/security/unpaid-order.test.ts`                                                        |
| 8   | Mutate a sealed `failed` payment to `completed`                                         | frozen object; write throws; status unchanged       | `tests/security/unpaid-order.test.ts`                                                        |
| 9   | Deliver a `completed` callback for a never-paid (mock) transaction                      | sealed to ledger truth (`pending`), not `completed` | `tests/mock/security.test.ts`, `tests/security/unpaid-order.test.ts`                         |
| 10  | Call a gateway status endpoint for an order it never saw                                | `UNKNOWN_TRANSACTION`                               | `tests/security/unpaid-order.test.ts`                                                        |
| 11  | Read the merchant secret back out of errors or `raw`                                    | secret never appears                                | `tests/esewa/security.test.ts`, `tests/mock/security.test.ts`                                |

### Why the core invariant holds

- Only `verify()` creates a `VerifiedPayment`, and the factory
  (`createVerifiedPayment`) is exported from `@nepal-payments/core/internal`,
  **not** the public entry point. `tests/security/unpaid-order.test.ts` asserts
  the public API surface does not contain it.
- The seal is a module-private `unique symbol` installed with
  non-enumerable, non-writable, non-configurable descriptors, and the whole
  object (`amount`, `txnRef`, `verifiedAt`, deep-cloned `raw`) is frozen
  (`packages/core/src/verified.ts`).
- `paymentFromVerified()` refuses anything that is not sealed, so unverified
  data cannot be written to a `PaymentStore`.
- Signatures and digests are compared in constant time, and every real gateway
  opts into server-side status confirmation (`serverVerification`), so a forged
  `COMPLETE` body is not sufficient.

## Residual and accepted risks

1. **In-process symbol extraction.** A caller with arbitrary in-process code can
   recover the brand symbol via `Object.getOwnPropertySymbols` and re-stamp a
   fake object with matching descriptors. The seal is an accident/type barrier,
   not an authorization boundary against hostile in-process code. Documented in
   [security.md](./security.md).
2. **Dual-copy caveat.** If two copies of `@nepal-payments/core` load at once
   (`src` alias plus `dist`, or two versions) each has its own symbol, and a
   payment sealed by one fails `isVerifiedPayment` in the other. Keep a single
   copy at runtime.
3. **Replay.** The SDK exposes `callbackFingerprint()` and deterministic
   verification; refusing duplicate notifications is the merchant's
   responsibility. eSewa callbacks carry no nonce, so dedupe by fingerprint.
4. **`node-forge` advisory.** See below; accepted with a scoped rationale.

## Dependency audit

- `@nepal-payments/core` has **zero runtime dependencies**.
- Every other published package depends only on `@nepal-payments/core`, except
  `@nepal-payments/connectips`, whose sole third-party runtime dependency is
  `node-forge@1.4.0` (`BSD-3-Clause OR GPL-2.0`), used only by
  `packages/connectips/src/pfx.ts` to parse the merchant-supplied
  `CREDITOR.pfx` during CLI import.
- `pnpm audit --prod` reports **1 high**: `node-forge`
  ([GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)),
  an RSA PKCS#1 v1.5 **signature verification** issue. No patched version is
  published (`Patched versions: <0.0.0`). Our use is PKCS#12 **decryption/parsing**
  of a local, operator-provided key file — we never call node-forge's signature
  verification, and no untrusted input reaches that code path at runtime.
  **Accepted**; revisit when node-forge ships a fix or a maintained PKCS#12
  parser is available.
- `pnpm audit` (full, incl. dev) reports 9 advisories (3 critical / 3 high /
  3 moderate) entirely inside the ESLint toolchain (`glob`→`minimatch`→`braces`,
  `cross-spawn`). They are build-time only, not shipped, and have no upstream
  fix yet. The CI audit gates on **critical production** vulnerabilities and
  posts the rest as a non-blocking report.
- `pnpm outdated -r` shows only patch-level drift plus major `@types/node`
  (20→26) and `typescript-eslint` (7→8) upgrades for dev; none are security
  relevant.

## Secret scanning

`.gitleaks.toml` extends the default gitleaks rule set and allowlists only the
intentional public sample credentials in `tests/fixtures`, `tests/vectors`,
`docs/*.md`, and `*.example`. CI runs gitleaks over the full history
(`.github/workflows/security.yml`). No live credentials exist in the repository;
the nightly sandbox job reads them from repository secrets and never writes them
to disk.

## Sign-off

The central invariant — no path produces a `completed` `VerifiedPayment` for an
unpaid or failed order — holds under the tested attacks. The remaining risks are
explicit, documented, and either scoped to trusted local input or left to the
integrating application by design.
