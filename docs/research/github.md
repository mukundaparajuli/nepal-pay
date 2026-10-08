# GitHub Research: Nepal Payment Gateway Implementations

## Search Date
2026-10-08

## Gateways Researched
- eSewa
- Khalti
- ConnectIPS
- Fonepay

## eSewa Implementations

### Python
- **aj3sh/esewa** - eSewa payment integration in Django
- Common pattern: form submission to eSewa endpoint with merchant code, product details, amount, return URLs
- Verification via callback verification

### PHP
- **surajitbasak109/eSewa-php** - PHP library for eSewa integration

### JavaScript/TypeScript
- **Ranjeet2063/nepal-pay** (npm package) - Unified SDK
- Various small implementations in personal repos

**Key API patterns:**
- Initiate: Create payment request with merchant_id, amount, transaction_uuid, product_code, success_url, failure_url
- eSewa uses form-based redirect (GET/POST to eSewa URL)
- Verification: Verify signature/hash, check amount, order ID

## Khalti Implementations

### Python
- **khalti/khalti-python-sdk** (official-ish?) or community implementations
- **opensource-nepal/khalti-sdk-python**

### JavaScript/TypeScript
- **khalti/khalti-js-sdk** - Khalti's official JS SDK
- **n8n-nodes-khalti** - n8n integration

**Key API patterns:**
- Khalti uses REST API (v2) - initiate via API call, get payment_url/token
- Requires API key/secret key
- Verification: Check payment status via API call
- Webhook/callback verification

## ConnectIPS Implementations

### Common implementations
- ConnectIPS by Nepal Clearing House (NCHL)
- REST API based
- Merchant ID, app key, app secret
- QR code and redirect flows
- Status verification required

**Key patterns:**
- HMAC signature generation
- Token-based auth in some flows
- Callback verification critical

## Fonepay Implementations

### PHP/Java implementations common
- Fonepay payment gateway (Nepal)
- Form-based redirect
- HMAC/SHA based signature
- DV (Data Verification) field
- Return/callback verification

**Key patterns:**
- Signature generation on request
- Signature verification on callback
- Product info, amount, order ID validation

## Comparison Summary

| Aspect | eSewa | Khalti | ConnectIPS | Fonepay |
|---|---|---|---|---|
| Flow Type | Form redirect | API-based (REST) + redirect | API-based + redirect | Form redirect |
| Auth | Merchant code + secret | API key/secret | App key/secret | Merchant code + secret |
| Signature | Varies (hash-based) | HMAC-based | HMAC-based | HMAC-SHA (DV field) |
| Verification | Callback verification | Status API check | Callback + API | Callback DV verification |
| Sandbox | Available | Available | Available | Varies |

## Common Implementation Approaches

1. **Stateless design**: Most SDKs take config (keys, sandbox flag) and methods
2. **Signature generation**: Consistent pattern - sort params, concatenate, hash/HMAC
3. **Verification**: Must verify amount, order ID, signature - server-side only
4. **Types**: Modern ones use TypeScript interfaces
5. **No float money**: String amounts preferred
6. **Error handling**: Custom errors for different failure modes

## Security Patterns Observed

- Constant-time comparison for signatures (rare in older libs)
- Server-side verification mandatory
- Never trust callback data without verification
- Amount/order validation critical
- Secrets never exposed to frontend

## References (GitHub searches)
Searched terms: "esewa payment node typescript", "khalti payment node", "connectips node", "fonepay node typescript", "nepal payment gateway"
