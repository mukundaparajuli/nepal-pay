import { createMockGateway } from '@nepal-pay/mock'
import { createApp } from './app.ts'

const gateway = createMockGateway({
  secretKey: process.env.MOCK_SECRET_KEY ?? 'express-example-dev-secret',
})
const app = createApp({ gateway })
const port = Number(process.env.PORT ?? 3000)

app.listen(port, () => {
  console.log(`express example listening on http://localhost:${port}`)
})
