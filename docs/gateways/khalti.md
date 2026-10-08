# Khalti Payment Gateway - Research Notes

## Status
Research based on community implementations and common API patterns. Official Khalti API docs should be referenced for production.

## Official Documentation
- Khalti Payment Gateway API: https://docs.khalti.com/ (referenced by community)
- Khalti Developer Portal: https://khalti.com/developers/

## Authentication
- Secret Key (for server-side operations)
- Public Key (for client-side if needed)
- API key-based authentication via headers

## Initiation (Khalti v2)
- REST API based flow (unlike pure form-redirect)
- Step 1: Create payment request via API (initiate transaction)
- Step 2: Get payment URL/token to redirect user
- More programmatic than eSewa

## Amount Format
- Amount in paisa (smallest unit) in API calls per some implementations
- Or in NPR with 2 decimals - check official spec
- Important to be precise

## Signature
- HMAC-based signatures
- API calls may use secret key for verification

## Callback/Return
- Return URL for redirect after payment
- Webhook/callback URL for server notification
- Both should be handled and verified

## Status API
- Verify transaction status via API endpoint using transaction ID
- Recommended to verify status server-side (independent of callback)

## Error Responses
- Structured JSON error responses
- Error codes/messages for different failure cases

## Expiration
- Payment links may expire
- Transaction validity periods exist

## Sandbox
- Sandbox environment available
- Separate API keys for sandbox
- Base URLs differ between sandbox/production

## Implementation Notes
- Khalti v2 API is RESTful (JSON)
- nepal-pay and khalti-payment npm packages implement v2 patterns
- Community implementations show API-first approach
