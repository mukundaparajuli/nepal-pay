# Fonepay - Research Notes

## Status

Fonepay is a Nepalese payment gateway. Implementation patterns from community sources. Official API documentation varies.

## Official Documentation

- Fonepay: https://www.fonepay.com/ (merchant documentation)
- API docs typically provided to merchants

## Authentication

- Merchant Code
- Secret key for signature generation
- Data Verification (DV) key

## Initiation

- Form-based redirect (common pattern)
- POST form to Fonepay payment URL with signed parameters

## Amount Format

- Amount in NPR
- Decimal format, typically 2 decimal places

## Signature

- HMAC-SHA512 or SHA-based for DV (Data Verification)
- DV field is critical - contains signed hash of request parameters
- Signature verification on callback responses

## Callback/Return

- Response URL (return) and possibly callback
- DV verification on response - must verify signature server-side

## Status API

- Transaction verification API may exist
- Recommended to verify status independently

## Error Responses

- Error codes returned on failure
- DV mismatch indicates tampering

## Sandbox/Production

- Sandbox environment may exist for testing
- Separate credentials and URLs

## Implementation Notes

- Form POST with DV parameter is key
- Verification is essential - callbacks are untrusted
- Amount and order validation critical
