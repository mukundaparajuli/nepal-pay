# AGENTS.md

## Architecture
- Stateless by default
- Web APIs where possible
- No framework dependency in core
- No database dependency
- No floating point money
- No gateway-specific logic in core

## Security
- Callbacks are untrusted
- Only verify() creates VerifiedPayment
- Verify amount
- Verify order
- Verify signature
- Server-side status verification
- Constant-time signature comparison
- Never log secrets

## Testing
- Every feature requires tests
- Every gateway requires fixtures
- Typecheck and tests must pass before completion

## Development
- Use pnpm workspaces
- TypeScript strict mode
- Vitest for testing
- ESLint + Prettier for code quality
