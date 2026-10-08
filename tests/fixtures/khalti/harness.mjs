#!/usr/bin/env node
// Khalti sandbox E2E harness: create -> redirect -> callback -> lookup -> COMPLETED
//
// The payment step itself is manual: Khalti requires the payer to complete the
// payment on pay.khalti.com with a test Khalti ID (e.g. 9800000000) + MPIN 1111
// + OTP 987654. This harness performs every automatable step.
//
// Usage:
//   KHALTI_SECRET_KEY=<sandbox live_secret_key> node harness.mjs
//
// It will print the payment_url, start a local HTTP server to receive the
// callback, save the callback query and the lookup response as JSON fixtures
// under <repo>/tests/fixtures/khalti/captures/, and report the final status.

import http from 'node:http'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)))
const PORT = 8812
const CALLBACK_PATH = '/callback'
const AMOUNT_PAISA = 1000
const PURCHASE_ORDER_ID = `khalti-e2e-${Date.now()}`
const INITIATE_URL = 'https://dev.khalti.com/api/v2/epayment/initiate/'
const LOOKUP_URL = 'https://dev.khalti.com/api/v2/epayment/lookup/'
const SECRET_KEY = process.env.KHALTI_SECRET_KEY

if (!SECRET_KEY) {
  console.error(
    'Missing KHALTI_SECRET_KEY. Get a sandbox secret key from https://test-admin.khalti.com and run this against the sandbox environment.'
  )
  process.exit(1)
}

const returnUrl = `http://localhost:${PORT}${CALLBACK_PATH}`

async function request(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Key ${SECRET_KEY}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: response.status, json }
}

function save(name, value) {
  const dir = resolve(ROOT, 'captures')
  mkdirSync(dir, { recursive: true })
  const file = resolve(dir, name)
  writeFileSync(file, JSON.stringify(value, null, 2))
  console.log(`saved ${file}`)
}

// Step 1: create / initiate
const { status, json } = await request(INITIATE_URL, {
  return_url: returnUrl,
  website_url: 'http://localhost',
  amount: AMOUNT_PAISA,
  purchase_order_id: PURCHASE_ORDER_ID,
  purchase_order_name: 'khalti-e2e',
})
if (status !== 200 || typeof json.pidx !== 'string') {
  console.error('initiate failed:', status, json)
  process.exit(1)
}
save('e2e-initiate.json', {
  request: { amount: AMOUNT_PAISA, purchase_order_id: PURCHASE_ORDER_ID },
  response_status: status,
  response: json,
})
const pidx = json.pidx
console.log('step 1 create: ok')
console.log(`step 2 redirect: open ${json.payment_url} in a browser`)
console.log('  pay with Khalti ID 9800000000, MPIN 1111, OTP 987654')

// Step 3+4: wait for the callback on the local server
const callbackQuery = await new Promise((resolvePromise, reject) => {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' || !req.url.startsWith(CALLBACK_PATH)) {
      res.writeHead(404).end()
      return
    }
    resolvePromise(req.url.split('?')[1] ?? '')
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
    server.close()
  })
  server.on('error', reject)
  server.listen(PORT, () => {
    console.log(
      `step 3/4 callback: listening on http://localhost:${PORT}${CALLBACK_PATH}`
    )
  })
})
const params = Object.fromEntries(new URLSearchParams(callbackQuery))
save('e2e-callback.json', {
  query_string: callbackQuery,
  query: params,
  provenance: `live capture of the Khalti sandbox redirect callback for pidx ${pidx}`,
})
console.log('step 4 callback: captured', params.status ?? '(no status)')

// Step 5: lookup
const lookup = await request(LOOKUP_URL, { pidx })
save('e2e-lookup.json', {
  request: { pidx },
  response_status: lookup.status,
  response: lookup.json,
  provenance: `live lookup response from the Khalti sandbox for pidx ${pidx}`,
})
console.log('step 5 lookup:', lookup.json.status ?? lookup.json)
if (lookup.json.status === 'Completed') {
  console.log('E2E COMPLETED')
} else {
  console.log(
    'final status is',
    lookup.json.status,
    '(expected after completing the payment in the opened page)'
  )
}
