# ConnectIPS fixtures

Provenance for every fixture in this directory.

## `creditor.pfx` + `creditor.crt.pem`

A **self-signed, throwaway** RSA credential packed as PKCS#12, used to test the
PKCS#12 → PKCS#8 conversion and the `npay connectips import-pfx` CLI without a
real NCHL credential.

- Password: `connectips-test-password`
- Subject/issuer CN: `ConnectIPS Test`
- 2048-bit RSA, SHA-256 self-signature
- Validity: 2020-01-01 → 2035-01-01

Regenerate with the same shape (node-forge, `3des` PBE) if needed. This key is
**not** a secret and is never used against a live gateway.

NCHL issues the production equivalent as `CREDENTIAL.pfx` alongside the merchant
`MERCHANTID`/`APPID`, application password, and registered success/failure URLs.
