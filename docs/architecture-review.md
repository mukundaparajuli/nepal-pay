# Architecture Review: Breaking the Abstraction

## Intent

Critically examine the proposed minimal abstraction (PaymentRequest, PaymentResponse, VerifiedPayment, PaymentGateway) against real gateway behaviors from research.

## Potential Breaking Cases

### 1. eSewa

- **Form field naming**: eSewa uses specific parameter names (e.g., amt, pid, scd/merchant code, su/fu). Our generic `productName` is fine, but mapping is straightforward.
- **ePaisa V2 variations**: May have different endpoints/params than classic eSewa.
- **Checksum calculation**: Signature string concatenation order is critical and gateway-specific. Abstraction is fine - impl handles it.
- **Cannot represent well?**: Maybe product/service code fields - we have metadata as escape hatch. OK.

### 2. Khalti (v2, REST API)

- **API-first flow**: Initiate requires API call to get payment URL; also needs authorization headers with secret key. This fits our `initiate()` returning `paymentUrl` - abstraction holds.
- **Amount in paisa**: Some APIs expect paisa (integer). Others NPR. Our Money uses decimal string - impl must convert. This is acceptable (gateway-specific concern).
- **Mobile/checkout types**: Khalti has different flows (mobile SDK, web). But for web redirect/API flows, abstraction is fine.
- **Status API is primary**: Khalti encourages status verification via API. Our `verify()` can call status API using payload/options. OK.
- **Cannot represent?**: Maybe "purchase order ID" vs "transaction ID" naming differs. We have both orderId and transactionId - reasonable.

### 3. ConnectIPS

- **HMAC signature on every request**: Request signing is gateway-specific. Abstraction doesn't constrain.
- **Token-based auth**: May need to get token first? Or auth via headers. Implementation detail.
- **Multiple payment channels**: May require specifying channel. Could go in metadata or config. Acceptable.
- **QR vs redirect**: Can return paymentUrl to QR page or redirect URL - both fit `paymentUrl`.
- **Bank selection**: Sometimes user selects bank. Our stateless abstraction doesn't capture UI flow choices - but that's fine for SDK.
- **Potential issue**: May need to include more fields (reference ID, remarks) - metadata covers.

### 4. Fonepay

- **DV (Data Verification) field**: Central to Fonepay. Signature generation order is strict. Impl handles.
- **Form POST only**: Redirect is form submission (not GET). But `paymentUrl` is still where to POST to - app constructs form. Abstraction allows.
- **Callback verification**: DV on response must match. Our verify() must compute/check - fits.
- **Product code, tax, service charge**: May have additional fields. Not in minimal common set. Use metadata? Or extend per-gateway request? But keeping core generic means we might need per-gateway request types extending PaymentRequest.
- **Cannot represent?**: Some Fonepay flows require specific parameter names/ordering not captured. But abstraction is for the contract, not the wire format.

## Fundamental Tensions

1. **Different auth models**: Khalti needs secret in header; others may need in signed payload. All can be handled in config + impl. OK.
2. **Sync vs async verify**: Some gateways require calling status API (async), others verify from callback payload (sync). Our verify() is async - works for both.
3. **Amount units**: Khalti sometimes uses paisa (int), others use NPR (decimal). Our string decimal is good compromise; impl converts.
4. **Expiration/validity**: Not in abstraction. Gateways may have expiry. Apps need to track - not SDK responsibility. Stateless is correct.
5. **Idempotency**: Not represented. Gateways may behave differently on retry. Out of scope for minimal abstraction.

## Where abstraction breaks

**Real breaking cases:**

- **Fonepay/Fonepay-like**: May require fields like "PRN" (Payment Reference Number) format constraints, or additional merchant fields. If gateway mandates a field not in common set, we either put in metadata (loses type safety) or extend types. Current abstraction is leaky in typing.
- **ConnectIPS**: May have different request/response shapes that don't map cleanly. For example, some flows need to specify "remarks" as mandatory in certain contexts? Unknown without full official docs.
- **3DS/extra auth**: Not captured. Some flows may require additional redirect steps. But final paymentUrl still fits.
- **Partial payments, refunds**: Out of scope (we're dealing with payment initiation/verification). Not relevant now.

## Recommendations

1. **Keep minimal core** but allow gateway-specific extensions via generics: `PaymentRequest<T = unknown>` or have `gatewaySpecific?: T`. This preserves core abstraction while allowing type safety per gateway.
2. **Don't overfit**: The current abstraction is "smallest common denominator" - it's reasonable for the 4 gateways. For cases requiring extra fields, use `metadata` or gateway-specific config/request variants.
3. **Callback verification is gateway-specific**: Our `verify()` signature takes payload - this is fine. Each impl interprets payload correctly.
4. **Amount representation**: String decimal is correct to avoid float. Converting to paisa for Khalti is impl detail.
5. **Status API access**: `verify()` might need to fetch status (Khalti). That’s fine as async.

**Verdict**: The abstraction is not fundamentally broken for these 4 gateways in redirect/API flows. The main weakness is type-safety for gateway-specific required fields - can be addressed with optional generics/extensions later without breaking core.
