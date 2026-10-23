import { describe, it, expect } from 'vitest'
import { runCli } from '@nepal-pay/cli'
import { testPrivateKeyPem } from '../connectips/helpers.js'
import { makeHarness } from './harness.js'

describe('npay gateway test', () => {
  it('runs the mock lifecycle by default', async () => {
    const h = makeHarness()
    const code = await runCli(['gateway', 'test'], h.ctx)
    expect(code).toBe(0)
    const out = h.stdout.join('\n')
    expect(out).toContain('PASS (mock)')
    expect(out).toContain('createCheckout')
    expect(out).toContain('verify')
  })

  it('runs an explicit mock smoke test', async () => {
    const h = makeHarness()
    const code = await runCli(['gateway', 'test', 'mock'], h.ctx)
    expect(code).toBe(0)
    expect(h.stdout.join('\n')).toContain('PASS (mock)')
  })

  it('honours --order-id and --amount', async () => {
    const h = makeHarness()
    const code = await runCli(
      [
        'gateway',
        'test',
        'mock',
        '--order-id',
        'CUSTOM-1',
        '--amount',
        '250.50',
      ],
      h.ctx
    )
    expect(code).toBe(0)
  })

  it('exits 2 for an unknown gateway', async () => {
    const h = makeHarness()
    expect(await runCli(['gateway', 'test', 'paypal'], h.ctx)).toBe(2)
    expect(h.stderr.join('\n')).toMatch(/unknown gateway/i)
  })

  it('reports missing configuration for a real gateway', async () => {
    const h = makeHarness()
    const code = await runCli(['gateway', 'test', 'esewa'], h.ctx)
    expect(code).toBe(1)
    expect(h.stderr.join('\n')).toContain('ESEWA_MERCHANT_CODE')
    expect(h.stderr.join('\n')).toContain('ESEWA_SECRET')
  })

  it('builds an eSewa checkout when configured', async () => {
    const h = makeHarness({
      env: { ESEWA_MERCHANT_CODE: 'EPAYTEST', ESEWA_SECRET: 'secret' },
    })
    const code = await runCli(['gateway', 'test', 'esewa'], h.ctx)
    expect(code).toBe(0)
    expect(h.stdout.join('\n')).toContain('PASS (esewa)')
  })

  it('builds a Khalti checkout when configured', async () => {
    const h = makeHarness({
      env: {
        KHALTI_SECRET_KEY: 'key',
        KHALTI_RETURN_URL: 'https://example.com/return',
      },
    })
    const code = await runCli(['gateway', 'test', 'khalti'], h.ctx)
    expect(code).toBe(0)
    expect(h.stdout.join('\n')).toContain('PASS (khalti)')
  })

  it('builds a Fonepay checkout when configured', async () => {
    const h = makeHarness({
      env: {
        FONEPAY_PID: 'pid-1',
        FONEPAY_SECRET_KEY: 'secret',
        FONEPAY_RETURN_URL: 'https://example.com/return',
      },
    })
    const code = await runCli(['gateway', 'test', 'fonepay'], h.ctx)
    expect(code).toBe(0)
    expect(h.stdout.join('\n')).toContain('PASS (fonepay)')
  })

  it('builds a connectIPS checkout when configured', async () => {
    const h = makeHarness({
      env: {
        CONNECTIPS_MERCHANT_ID: '550',
        CONNECTIPS_APP_ID: 'MER-550-APP-1',
        CONNECTIPS_APP_NAME: 'Test Merchant',
        CONNECTIPS_PASSWORD: 'secret',
        CONNECTIPS_PRIVATE_KEY_PEM: testPrivateKeyPem(),
      },
    })
    const code = await runCli(['gateway', 'test', 'connectips'], h.ctx)
    expect(code).toBe(0)
    expect(h.stdout.join('\n')).toContain('PASS (connectips)')
  })

  it('reads a connectIPS key from a file path', async () => {
    const h = makeHarness({
      env: {
        CONNECTIPS_MERCHANT_ID: '550',
        CONNECTIPS_APP_ID: 'MER-550-APP-1',
        CONNECTIPS_APP_NAME: 'Test Merchant',
        CONNECTIPS_PASSWORD: 'secret',
        CONNECTIPS_PRIVATE_KEY_PATH: 'creditor.key.pem',
      },
    })
    h.seedFile('creditor.key.pem', testPrivateKeyPem())
    const code = await runCli(['gateway', 'test', 'connectips'], h.ctx)
    expect(code).toBe(0)
  })

  it('prints help and exits 0', async () => {
    const h = makeHarness()
    expect(await runCli(['gateway', 'test', '--help'], h.ctx)).toBe(0)
    expect(h.stdout.join('\n')).toMatch(/Usage: npay gateway test/)
  })

  it('exits 2 for extra positional arguments', async () => {
    const h = makeHarness()
    expect(await runCli(['gateway', 'test', 'mock', 'extra'], h.ctx)).toBe(2)
  })
})
