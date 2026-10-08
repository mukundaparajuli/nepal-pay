import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sandboxStatusUrl =
  'https://rc-epay.esewa.com.np/api/epay/transaction/status/'
const productCode = 'EPAYTEST'
const transactionUuid = `fixture-${Date.now()}`

const params = new URLSearchParams({
  product_code: productCode,
  total_amount: '100',
  transaction_uuid: transactionUuid,
})

const url = `${sandboxStatusUrl}?${params.toString()}`
console.log(`GET ${url}`)
const response = await fetch(url, { headers: { accept: 'application/json' } })
console.log(`HTTP ${response.status}`)

if (!response.ok) {
  throw new Error(`status probe failed with HTTP ${response.status}`)
}

const body = await response.json()
const output = join(
  dirname(fileURLToPath(import.meta.url)),
  'status-not-found.json'
)
writeFileSync(output, `${JSON.stringify(body, null, 2)}\n`)
console.log(`wrote ${output}`)
