import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { RootProvider } from 'fumadocs-ui/provider/next'
import './global.css'

export const metadata: Metadata = {
  title: {
    default: 'Nepal Pay',
    template: '%s | Nepal Pay',
  },
  description:
    'A stateless TypeScript SDK for eSewa, Khalti, connectIPS, and Fonepay.',
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col antialiased">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
