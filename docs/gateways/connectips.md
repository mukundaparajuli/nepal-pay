# connectIPS - Research Notes

## Status

ConnectIPS is the merchant payment product of Nepal Clearing House Limited
(NCHL). Integration is form-POST based for the payer redirect plus two
REST APIs (payment validation and transaction details) for server-side
verification. There is **no signature on the browser callback** — the only
value appended to the redirect URL is `TXNID`.

## Official Documentation

- NCHL: https://nchl.com.np/
- Merchant interface: https://doc.connectips.com/docs/connectIPS-Gateway/merchant-interface
- Payment validation: https://doc.connectips.com/docs/connectIPS-Gateway/payment-validation
- Transaction details: https://doc.connectips.com/docs/connectIPS-Gateway/txn_details
- Response list: https://doc.connectips.com/docs/connectIPS-Gateway/validateTxn-getTxnDetail

The `base_url` is `https://uat.connectips.com` for UAT. Production is
documented as `https://connectips.com`, though NCHL confirms the exact base at
onboarding, so the SDK makes every endpoint overridable.

## Authentication / keys

- NCHL issues a **`CREDITOR.pfx`** PKCS#12 archive containing the merchant's
  RSA private key and certificate. It is used to sign the TOKEN with
  `SHA256withRSA` (i.e. `RSASSA-PKCS1-v1_5` + SHA-256).
- The two REST APIs use HTTP Basic auth: user name = **APPID**, password =
  NCHL-provided API password.
- WebCrypto cannot read PKCS#12, so
  `@nepal-payments/connectips/pfx` converts the archive to a PKCS#8 PEM with
  `node-forge`; `@nepal-payments/core` then imports that PEM.

## Payment request (login page)

- URL: `POST https://{base_url}/connectipswebgw/loginpage`
- Content type: `application/x-www-form-urlencoded`
- Fields (exact order used to build the TOKEN):

| Field         | Notes                                       |
| ------------- | ------------------------------------------- |
| `MERCHANTID`  | issued by NCHL                              |
| `APPID`       | issued by NCHL                              |
| `APPNAME`     | application name shown to the payer         |
| `TXNID`       | unique per request, max 20 chars            |
| `TXNDATE`     | `DD-MM-YYYY`                                |
| `TXNCRNCY`    | `NPR`                                       |
| `TXNAMT`      | integer **paisa**                           |
| `REFERENCEID` | extra transaction information, max 20 chars |
| `REMARKS`     | max 50 chars                                |
| `PARTICULARS` | max 100 chars                               |
| `TOKEN`       | base64 SHA256withRSA signature              |

### TOKEN message

```
MERCHANTID=<v>,APPID=<v>,APPNAME=<v>,TXNID=<v>,TXNDATE=<v>,TXNCRNCY=<v>,TXNAMT=<v>,REFERENCEID=<v>,REMARKS=<v>,PARTICULARS=<v>,TOKEN=TOKEN
```

Sign the UTF-8 bytes of that string with the private key and base64-encode the
signature. The literal `TOKEN=TOKEN` suffix is part of the signed message.

## User redirection / callback

Success and failure URLs are registered statically with NCHL. On redirection
connectIPS appends only the transaction id:

```
https://merchant.example/payments/success?TXNID=txn-123
```

Because nothing else is present, the callback is untrusted input: the merchant
must call `validatetxn` to learn the outcome.

## Payment validation API

- URL: `POST https://{base_url}/connectipswebws/api/creditor/validatetxn`
- Basic auth: APPID : password
- Token string:

```
MERCHANTID=<merchantId>,APPID=<appId>,REFERENCEID=<TXNID>,TXNAMT=<amount in paisa>
```

Note `REFERENCEID` here is the **TXNID** used at the login page, not the
`REFERENCEID` form field.

- Request body:

```json
{
  "merchantId": "550",
  "appId": "MER-550-APP-1",
  "referenceId": "txn-123",
  "txnAmt": "500",
  "token": "base64..."
}
```

- Response:

```json
{
  "merchantId": 550,
  "appId": "MER-550-APP-1",
  "referenceId": "txn-123",
  "txnAmt": "500",
  "token": null,
  "status": "SUCCESS",
  "statusDesc": "TRANSACTION SUCCESFULL"
}
```

## Transaction details API

- URL: `POST https://{base_url}/connectipswebws/api/creditor/gettxndetail`
- Same auth, token string and request body as `validatetxn`.
- Response adds `txnId`, `batchId`, `txnDate`, `chargeAmt`,
  `chargeLiability`, `refId`, `remarks`, `particulars` and `creditStatus`.

`creditStatus` values `000`, `999` and `DEFER` mean the merchant credit
succeeded; anything else (e.g. `888`) means it failed.

## Status/response codes

| `status`  | Meaning                                   |
| --------- | ----------------------------------------- |
| `SUCCESS` | transaction successful                    |
| `FAILED`  | debit or credit failed                    |
| `ERROR`   | not found, or the payer never entered OTP |

`ERROR` covers both "transaction not found" and "transaction incomplete", so it
maps to a unified `unknown` (never `failed`).

## Amount

- Login and both APIs use integer **paisa** (NPR × 100).
- `Money` with precision `0` (rupees) is scaled to paisa; precision above `2` is
  rejected.

## SDK mapping

| connectIPS                                       | unified     |
| ------------------------------------------------ | ----------- |
| `SUCCESS` (credit `000`/`999`/`DEFER` or absent) | `completed` |
| `SUCCESS` with a non-settling `creditStatus`     | `failed`    |
| `FAILED`                                         | `failed`    |
| `ERROR` / anything unknown                       | `unknown`   |

## Sandbox / UAT

- Base URL `https://uat.connectips.com`; credentials and `CREDITOR.pfx`
  supplied by NCHL.
- Live tests are scaffolded in `tests/connectips/uat.live.test.ts` and skipped
  unless `NPAY_CONNECTIPS_UAT=1` with credentials present.
