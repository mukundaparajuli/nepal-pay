import { describe, it, expect } from 'vitest'
import { runCli } from '@nepal-pay/cli'
import { makeHarness } from './harness.js'

describe('npay init', () => {
  it('writes .env.example with the default gateways', async () => {
    const h = makeHarness()
    const code = await runCli(['init'], h.ctx)
    expect(code).toBe(0)
    const content = h.files.get('.env.example') ?? ''
    expect(content).toContain('ESEWA_MERCHANT_CODE=')
    expect(content).toContain('KHALTI_SECRET_KEY=')
    expect(content).toContain('CONNECTIPS_MERCHANT_ID=')
    expect(content).toContain('FONEPAY_PID=')
    expect(h.stdout.join('\n')).toContain('.env.example')
  })

  it('limits output to the selected gateways', async () => {
    const h = makeHarness()
    const code = await runCli(['init', '--gateways', 'esewa,khalti'], h.ctx)
    expect(code).toBe(0)
    const content = h.files.get('.env.example') ?? ''
    expect(content).toContain('ESEWA_SECRET=')
    expect(content).toContain('KHALTI_SECRET_KEY=')
    expect(content).not.toContain('FONEPAY_PID')
    expect(content).not.toContain('CONNECTIPS_MERCHANT_ID')
  })

  it('honours --out', async () => {
    const h = makeHarness()
    const code = await runCli(['init', '--out', 'env/template'], h.ctx)
    expect(code).toBe(0)
    expect(h.files.has('env/template')).toBe(true)
    expect(h.files.has('.env.example')).toBe(false)
  })

  it('refuses to overwrite without --force', async () => {
    const h = makeHarness()
    h.seedFile('.env.example', 'existing')
    expect(await runCli(['init'], h.ctx)).toBe(1)
    expect(h.files.get('.env.example')).toBe('existing')
    expect(await runCli(['init', '--force'], h.ctx)).toBe(0)
    expect(h.files.get('.env.example')).not.toBe('existing')
  })

  it('exits 2 for an unknown gateway in --gateways', async () => {
    const h = makeHarness()
    expect(await runCli(['init', '--gateways', 'paypal'], h.ctx)).toBe(2)
    expect(h.stderr.join('\n')).toMatch(/gateways/i)
  })

  it('prints help and exits 0', async () => {
    const h = makeHarness()
    expect(await runCli(['init', '--help'], h.ctx)).toBe(0)
    expect(h.stdout.join('\n')).toMatch(/Usage: npay init/)
  })

  it('contains placeholders only (no secret values)', async () => {
    const h = makeHarness()
    await runCli(['init'], h.ctx)
    const content = h.files.get('.env.example') ?? ''
    expect(content).not.toMatch(/ESEWA_SECRET=.+/)
    expect(content).not.toMatch(/KHALTI_SECRET_KEY=.+/)
    expect(content).not.toMatch(/CONNECTIPS_PASSWORD=.+/)
    expect(content).not.toMatch(/FONEPAY_SECRET_KEY=.+/)
  })
})
