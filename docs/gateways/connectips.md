# ConnectIPS - Research Notes

## Status
ConnectIPS is operated by Nepal Clearing House (NCHL). Limited public API docs in community repos; implementation patterns inferred from community code.

## Official Documentation
- Nepal Clearing House: https://nchl.com.np/
- ConnectIPS: https://connectips.com/ (as referenced)
- Merchant integration docs typically provided directly to merchants

## Authentication
- Merchant ID
- App Key / API Key
- App Secret / Secret Key
- May use token-based authentication

## Initiation
- REST API flow
- Generate payment request, receive redirect URL or QR
- Supports multiple payment methods

## Amount Format
- Amount in NPR
- Standard decimal format

## Signature
- HMAC-based signature generation
- Critical for request integrity and callback verification

## Callback/Return
- Callback URL for payment notification
- Return URL for user redirect
- Must verify signature on callbacks

## Status API
- Transaction status verification endpoint
- Server-side verification required

## Error Responses
- Error codes and messages
- Various failure scenarios documented in merchant portal

## Sandbox
- Sandbox environment likely available for registered merchants

## Implementation Notes (Community)
- Less community OSS than eSewa/Khalti
- Implementations follow HMAC signature pattern
- QR code flow and redirect flow supported
