# Tutorials

Hands-on, step-by-step walkthroughs. Each one is self-contained: it tells you
what to type, what you should see, and why. Do them in order.

| #   | Tutorial                                                 | You will learn                                                              | Credentials needed        |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------- |
| 1   | [Your first payment](./01-first-payment.md)              | The full lifecycle on your machine with the mock gateway                    | none                      |
| 2   | [A checkout page with Express](./02-express-checkout.md) | Build a real server: checkout route, callback route, idempotent fulfillment | none (mock), then sandbox |
| 3   | [Going live](./03-go-live.md)                            | Real credentials per gateway, sandbox testing, the production checklist     | sandbox + production      |

## How to use these tutorials

- **Read the prose, don't just copy the code.** Every step explains the _why_;
  the security rules only make sense once you see them applied.
- **Type the commands yourself.** Copy-paste hides typos and version problems.
- **Compare your output.** Each step shows the expected output. If yours differs,
  stop and read the [troubleshooting guide](../troubleshooting.md).

## What you need

- **Node.js 20 or newer** (`node --version`). Node 22.6+ can run TypeScript
  files directly; otherwise the tutorials use [`tsx`](https://tsx.is).
- **pnpm** (or npm/yarn — the commands are shown with `pnpm`).
- A terminal and a text editor. No gateway account for tutorials 1 and 2.

## Where to go after

- [Getting started](../getting-started.md) — the concepts reference behind these
  tutorials.
- [Per-gateway guides](../esewa.md) — eSewa, Khalti, connectIPS, Fonepay.
- [Security](../security.md) — the trust model in depth.
