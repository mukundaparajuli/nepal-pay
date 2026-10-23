import { pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import type { GatewayAdapter } from '@nepal-pay/core'
import { createMockGateway } from '@nepal-pay/mock'
import { createApp } from './app.ts'

export interface RunningServer {
  readonly url: string
  close(): Promise<void>
}

export function startServer(options: {
  readonly gateway: GatewayAdapter
  readonly port?: number
}): RunningServer {
  const app = createApp({ gateway: options.gateway })
  const server = serve({ fetch: app.fetch, port: options.port ?? 0 })
  const address = server.address()
  const port =
    typeof address === 'object' && address !== null
      ? address.port
      : (options.port ?? 3000)
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error?: Error) => {
          if (error !== undefined) reject(error)
          else resolve()
        })
      }),
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const gateway = createMockGateway({
    secretKey: process.env.MOCK_SECRET_KEY ?? 'hono-example-dev-secret',
  })
  const server = startServer({
    gateway,
    port: Number(process.env.PORT ?? 3000),
  })
  console.log(`hono example listening on ${server.url}`)
}
