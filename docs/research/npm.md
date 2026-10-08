# NPM Search Research: Nepal Payment TypeScript/Node SDKs

## Search Date

2026-10-08

## Search Queries Used

- "nepal payment esewa khalti typescript sdk"
- "esewa typescript node"
- "khalti typescript node"
- "nepal-pay"

## Findings

### Existing Packages

#### nepal-pay

- **Package**: [nepal-pay](https://www.npmjs.com/package/nepal-pay) (v1.0.0)
- **Description**: Unified, type-safe Nepal payment gateway SDK for eSewa (ePaisa V2), Khalti (V2), and Fonepay. Works with Node.js, Bun, Next.js, and TypeScript.
- **Keywords**: nepal, payment, esewa, khalti, fonepay, epaisa, epayment, gateway, sdk, typescript, nextjs, fintech
- **Downloads**: ~186/month, ~6/week
- **License**: MIT
- **Maintained**: Yes, published 2026-09-05
- **Status**: New/early stage (v1.0.0)
- **Notes**: Supports all major Nepal gateways (eSewa, Khalti, Fonepay)

#### khalti-payment

- **Package**: [khalti-payment](https://www.npmjs.com/package/khalti-payment) (v1.0.2)
- **Description**: A Node.js module for interacting with the Khalti payment gateway (initiate payments and status lookup)
- **Keywords**: khalti, payment, gateway, api
- **Downloads**: ~78/month, ~9/week
- **License**: ISC
- **Maintained**: Last published 2024-04-17
- **Status**: Inactive/low maintenance

#### Other related

- Various utility packages exist (nepal-places, nepali-calendar, etc.) but not payment SDKs
- n8n-nodes-khalti exists as an n8n integration
- esewa-mcp exists as an MCP server

## API Design Observations

nepal-pay (most comprehensive):

- Unified API supporting multiple gateways
- TypeScript-first with type safety
- Works across Node.js, Bun, Next.js
- Supports modern versions (eSewa ePaisa V2, Khalti V2, Fonepay)
- Relatively new package with active development

## Market Gap

- Few actively maintained, modern TypeScript SDKs for Nepal payment gateways
- Most existing packages are either gateway-specific, unmaintained, or have minimal features
- Our monorepo approach (core + specific gateway packages + examples + tests) is a clean, stateless design
- Focus on stateless, no framework deps, no DB, no float money as specified is good

## Recommendation

The market has limited modern, well-maintained options. Creating a clean, stateless, TypeScript-first monorepo as specified fills a gap - especially with strong security practices (constant-time comparison, verification-first mindset, no secrets logging) and proper architecture.
