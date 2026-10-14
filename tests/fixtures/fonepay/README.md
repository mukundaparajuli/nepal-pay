# Fonepay test vectors

Pinned HMAC-SHA512 DV vectors, computed independently with Node's `crypto`
(`crypto.createHmac('sha512', secret).update(message).digest('hex').toUpperCase()`).

- Secret: `fonepay-test-secret`

## Request (initiation)

Field order: `PID,MD,PRN,AMT,CRN,DT,R1,R2,RU`

```
message: 1234567890,P,ORD-123,230.00,NPR,03/15/2022,Order ORD-123,N/A,https://merchant.example/callback
DV:      60FA8109A20021A054E79804967053DD811357EC8D144E72CCDC36923D4B48E3D2650F57622350F255F3DF6578380A888B49DA534EF0E61C18245D0D4077436B
```

## Response (callback)

Field order: `PRN,PID,PS,RC,UID,BC,INI,P_AMT,R_AMT`

```
message: ORD-123,1234567890,true,successful,FP-UID-12345,GBIME,9800000001,230.00,0.00
DV:      A885A75DE8B1DB99C5EF068B69482429B3B6D6FF0D5C7F4CF4FF9DA178456F1A3AD005F61F49658334BF4F7D86B4B6C1483BEFC06F1BD0B183474A2EBDD30F31
```

These vectors are asserted in `tests/fonepay/signing.test.ts`.
