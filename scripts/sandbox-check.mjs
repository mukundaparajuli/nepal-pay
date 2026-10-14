#!/usr/bin/env node
/**
 * Nightly sandbox reachability + schema check for eSewa and Khalti.
 *
 * Credentials are read from the environment and are NEVER hard-coded or
 * committed. If none are configured the script exits 0 without touching the
 * network, so the workflow stays green for forks and forks of forks.
 *
 * It prints the top-level response keys so a reviewer can spot upstream API
 * changes from the nightly log.
 */

const TIMEOUT_MS = 10_000

const ESEWA_STATUS_URL =
  'https://rc-epay.esewa.com.np/api/epay/transaction/status/'
const KHALTI_INITIATE_URL = 'https://dev.khalti.com/api/v2/epayment/initiate/'

async function request(url, init) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const text = await response.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = undefined
    }
    return { status: response.status, ok: response.ok, text, json }
  } finally {
    clearTimeout(timer)
  }
}

function keysOf(json) {
  if (json === undefined || typeof json !== 'object' || json === null) {
    return '<not-an-object>'
  }
  return Object.keys(json).sort().join(',')
}

async function checkEsewa(merchantCode) {
  const uuid = `sandbox-check-${Date.now()}`
  const url = `${ESEWA_STATUS_URL}?product_code=${encodeURIComponent(
    merchantCode
  )}&total_amount=100&transaction_uuid=${encodeURIComponent(uuid)}`
  const result = await request(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  if (!result.ok) throw new Error(`HTTP ${result.status}`)
  if (result.json === undefined) throw new Error('response was not JSON')
  if (!('status' in result.json)) {
    throw new Error('response JSON has no "status" field')
  }
  return `status=${result.json.status} keys=${keysOf(result.json)}`
}

async function checkKhalti(secretKey) {
  const body = {
    return_url: 'https://example.com/return',
    website_url: 'https://example.com',
    amount: 1000,
    purchase_order_id: `sandbox-check-${Date.now()}`,
    purchase_order_name: 'sandbox-check',
  }
  const result = await request(KHALTI_INITIATE_URL, {
    method: 'POST',
    headers: {
      authorization: `Key ${secretKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (result.status === 401 || result.status === 403) {
    throw new Error(`HTTP ${result.status} (check the sandbox secret key)`)
  }
  if (!result.ok) {
    throw new Error(`HTTP ${result.status}: ${result.text.slice(0, 200)}`)
  }
  if (result.json === undefined) throw new Error('response was not JSON')
  for (const field of ['pidx', 'payment_url']) {
    const value = result.json[field]
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`response is missing field "${field}"`)
    }
  }
  return `pidx=${result.json.pidx} keys=${keysOf(result.json)}`
}

async function main() {
  const esewaCode = process.env.ESEWA_MERCHANT_CODE
  const khaltiSecret = process.env.KHALTI_SECRET_KEY

  const checks = []
  if (esewaCode) {
    checks.push(['eSewa sandbox status', () => checkEsewa(esewaCode)])
  }
  if (khaltiSecret) {
    checks.push(['Khalti sandbox initiate', () => checkKhalti(khaltiSecret)])
  }

  if (checks.length === 0) {
    console.log(
      'sandbox-check: no sandbox credentials configured; nothing to do'
    )
    return
  }

  let failed = 0
  for (const [name, run] of checks) {
    try {
      const detail = await run()
      console.log(`ok    ${name} (${detail})`)
    } catch (error) {
      failed += 1
      console.error(
        `FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  if (failed > 0) {
    console.error(`sandbox-check: ${failed} check(s) failed`)
    process.exitCode = 1
    return
  }
  console.log('sandbox-check: all checks passed')
}

await main()
