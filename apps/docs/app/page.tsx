import Link from 'next/link'
import { repoUrl } from '@/lib/shared'

const features = [
  {
    title: 'Exact money',
    description:
      'Every amount is a bigint in minor units. No floating point, no rounding drift.',
  },
  {
    title: 'Verify before trust',
    description:
      'Callbacks are untrusted. Only verify() can produce a sealed VerifiedPayment.',
  },
  {
    title: 'One contract',
    description:
      'eSewa, Khalti, connectIPS, and Fonepay share one lifecycle and one adapter API.',
  },
  {
    title: 'Stateless by default',
    description:
      'No sessions, database, or framework coupling. Persist only what your app needs.',
  },
] as const

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-16 sm:py-24">
      <section className="max-w-3xl">
        <p className="mb-4 font-mono text-sm font-semibold text-fd-primary">
          Nepal Pay SDK
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Payments for Nepal,
          <br />
          without the guesswork.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-fd-muted-foreground">
          A stateless, framework-agnostic TypeScript SDK for eSewa, Khalti,
          connectIPS, and Fonepay, with a deterministic mock gateway for tests
          and local development.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/docs"
            className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-semibold text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            Read the docs
          </Link>
          <Link
            href="/docs/getting-started/quickstart"
            className="rounded-lg border border-fd-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-fd-accent"
          >
            Quickstart
          </Link>
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          >
            GitHub
          </a>
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-2">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border border-fd-border bg-fd-card p-5"
          >
            <h2 className="font-semibold">{feature.title}</h2>
            <p className="mt-2 text-sm text-fd-muted-foreground">
              {feature.description}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-16 rounded-xl border border-fd-border bg-fd-card p-6">
        <h2 className="text-xl font-semibold">Install</h2>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-fd-secondary p-4 text-sm">
          <code>pnpm add @nepal-pay/core @nepal-pay/esewa</code>
        </pre>
        <p className="mt-4 text-sm text-fd-muted-foreground">
          Add one package per gateway you use. The mock gateway has no runtime
          dependencies and needs no credentials.
        </p>
      </section>
    </main>
  )
}
