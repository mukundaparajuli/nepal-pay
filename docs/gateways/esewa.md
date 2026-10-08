# eSewa Payment Gateway - Research Notes

## Status
Research based on common knowledge and observed implementation patterns. Distinguishing between official and community sources is noted where relevant.

## Official Documentation
- eSewa Developer Documentation: https://developer.esewa.com.np/ (commonly referenced)
- Note: Official docs may require merchant account access; community docs supplement understanding

## Authentication
- Merchant Code (unique identifier for merchant)
- Secret key/merchant secret for signature verification
- Configured per environment (sandbox/production)

## Initiation
- Form-based redirect flow
- Merchant submits form to eSewa payment URL with required parameters
- eSewa collects payment and redirects back to success/failure URLs

## Amount Format
- Amount in NPR (Nepalese Rupees)
- Typically decimal with up to 2 decimal places
- No floating point in processing (use strings)

## Signature
- HMAC/hash-based signature for request verification
- Signature verification on callback responses
- Order of parameters matters for signature generation

## Callback/Return
- successUrl/failureUrl - return URLs after payment
- callbackUrl - server-to-server callback (IPN-style)
- Callbacks must be verified server-side (untrusted)

## Status API
- May have transaction verification API to confirm payment status
- Server-side verification strongly recommended even if callback received

## Error Responses
- Various error codes depending on failure mode
- Include invalid amount, invalid merchant, transaction failed, etc.

## Expiration
- Payment sessions may have expiration time
- Order IDs should be unique and time-bounded

## Sandbox
- Separate sandbox merchant credentials
- Sandbox URL different from production
- Test environment available for integration

## Implementation Notes (Community vs Official)
- Community implementations (npm: nepal-pay, GitHub repos) show form-redirect pattern
- Need to verify against latest official eSewa v2 API
- eSewa ePaisa V2 mentioned in newer packages
