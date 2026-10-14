# Fonepay - Research Notes

## Status

Fonepay is a Nepalese payment gateway (Fonepay / F1Soft). The merchant
integration is a **GET redirect**: the merchant sends signed query parameters to
Fonepay, the payer authenticates, and Fonepay returns the payer to the
registered return URL (`RU`) with a signed result in the query string.

Authenticity is carried by a **Data Verification (DV)** field: an HMAC-SHA512 of
the request/response values using a shared secret key.

## Official Documentation

- Fonepay: https://www.fonepay.com/
- Merchant documentation is provided to merchants by their partner bank.

Because the public documentation varies, the SDK treats every endpoint as
overridable and pins the DV format with checked-in test vectors
(`tests/fixtures/fonepay/README.md`).

## Authentication / keys

- **PID** — merchant code issued by the partner bank.
- **Secret key** — shared HMAC-SHA512 secret (also called the DV key).
- There is no PKI; integrity relies entirely on the shared secret.

## Payment request (initiation)

- URL: `GET https://{host}/api/merchantRequest`
- Sandbox host: `https://dev-clientapi.fonepay.com`
- Production host: `https://clientapi.fonepay.com`
- Parameters (exact order used to build the request DV):

| Field | Notes                                                       |
| ----- | ----------------------------------------------------------- |
| `PID` | merchant code                                               |
| `MD`  | merchant detail flag, `P` for a payment                     |
| `PRN` | unique merchant reference, 3–25 chars                       |
| `AMT` | amount in NPR, two decimal places (`230.00`)                |
| `CRN` | currency, `NPR`                                             |
| `DT`  | date, `MM/DD/YYYY`                                          |
| `R1`  | first remark (free text)                                    |
| `R2`  | second remark; `N/A` when unused                            |
| `RU`  | return URL the payer is redirected to                       |
| `DV`  | HMAC-SHA512 of the comma-joined values above, uppercase hex |

### Request DV message

The DV is computed over the **values only**, joined with commas in this order:

```
PID,MD,PRN,AMT,CRN,DT,R1,R2,RU
```

Because the message is comma-joined, `PRN`, `R1` and `R2` must not contain a
comma (the SDK rejects such values).

## User redirection / callback

Fonepay redirects the payer to `RU` with the signed result in the query string:

| Field   | Notes                                             |
| ------- | ------------------------------------------------- |
| `PRN`   | merchant reference (matches the request)          |
| `PID`   | merchant code                                     |
| `PS`    | payment status flag, `true` / `false`             |
| `RC`    | response code, `successful` / `failed` / `cancel` |
| `UID`   | Fonepay unique transaction id                     |
| `BC`    | bank code                                         |
| `INI`   | payer identifier (e.g. mobile number)             |
| `P_AMT` | paid amount                                       |
| `R_AMT` | refund amount                                     |
| `DV`    | HMAC-SHA512 of the comma-joined values below      |

### Response DV message

```
PRN,PID,PS,RC,UID,BC,INI,P_AMT,R_AMT
```

The SDK compares the DV case-insensitively in constant time (Fonepay emits
uppercase hex; some implementations compare decoded bytes).

## Status API (optional, server-to-server)

- URL: `GET https://{host}/api/merchantRequest/verificationMerchant`
- Query: `PID`, `PRN`, `AMT`, `BID` (bank id, optional), `MD=P`
- Response: plain text containing `success` on a settled payment; any other
  body is treated as failed (`fail`) or unknown.

The lookup requires the amount, so a status query must be paired with an
expected order; Fonepay cannot recover an amount from a bare reference.

## Status/response codes

| `RC` / body                | Unified     |
| -------------------------- | ----------- |
| `successful`, or `PS=true` | `completed` |
| `failed`, or `PS=false`    | `failed`    |
| `cancel`                   | `canceled`  |
| anything unknown           | `unknown`   |

## Amount

- Amounts are decimal NPR strings with **two** decimal places (`230.00`).
- `Money` with precision `0` (rupees) is scaled to two decimals; precision above
  `2` is rejected.

## SDK mapping

| Fonepay                                        | unified                         |
| ---------------------------------------------- | ------------------------------- |
| `RC=successful` (and `PS≠false`)               | `completed`                     |
| `RC=failed` / `PS=false`                       | `failed`                        |
| `RC=cancel`                                    | `canceled`                      |
| `verificationMerchant` disagrees with callback | downgraded to the server status |
| anything unknown                               | `unknown`                       |

## Sandbox / UAT

- Sandbox host `https://dev-clientapi.fonepay.com`; credentials supplied by the
  partner bank.
- Live tests are scaffolded in `tests/fonepay/uat.live.test.ts` and skipped
  unless `NPAY_FONEPAY_UAT=1` with credentials present.
