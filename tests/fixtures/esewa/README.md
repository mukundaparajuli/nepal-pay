# eSewa fixtures

- `status-not-found.json` — REAL capture from the UAT status API
  (`https://rc-epay.esewa.com.np/api/epay/transaction/status/?product_code=EPAYTEST&total_amount=100&transaction_uuid=fixture-1791457964496`,
  HTTP 200). Refresh with `node harness.mjs`.
- `status-complete.json` — docs-derived example (UAT sandbox doc page).
- `callback-complete.json` — docs-derived example (official callback `data`.
  The bundled `signature` uses a stale example key and is NOT reproducible
  with the current UAT secret; tests that need a valid signature recompute it
  with `signFields`).
- `callback-complete-110.json` — docs-derived example with a `110.0` numeric
  literal (used to exercise raw-literal signature reconstruction).

Signing ground truth (reproducible): message
`total_amount=110,transaction_uuid=241028,product_code=EPAYTEST` with secret
`8gBm/:&EnhH.1/q` → signature `i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME=`.
