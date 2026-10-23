import { describe, it, expect } from 'vitest'
import { importPkcs8PrivateKey, rsaSha256Sign } from '@nepal-pay/core'
import { runCli } from '@nepal-pay/cli'
import { TEST_PFX_PASSWORD, loadTestPfx } from '../connectips/helpers.js'
import { makeHarness } from './harness.js'

describe('npay connectips import-pfx', () => {
  it('converts a PFX to a PKCS#8 PEM using the env password', async () => {
    const { pfx } = loadTestPfx()
    const h = makeHarness({ env: { NPAY_PFX_PASSWORD: TEST_PFX_PASSWORD } })
    h.seedBytes('creditor.pfx', pfx)

    const code = await runCli(
      ['connectips', 'import-pfx', 'creditor.pfx'],
      h.ctx
    )

    expect(code).toBe(0)
    const pem = h.files.get('creditor.key.pem')
    expect(pem).toContain('-----BEGIN PRIVATE KEY-----')
    expect(h.stdout.join('\n')).toContain('creditor.key.pem')
    await expect(importPkcs8PrivateKey(pem ?? '')).resolves.toBeDefined()
  })

  it('supports an explicit --out path and --cert-out', async () => {
    const { pfx } = loadTestPfx()
    const h = makeHarness({ env: { NPAY_PFX_PASSWORD: TEST_PFX_PASSWORD } })
    h.seedBytes('in.pfx', pfx)

    const code = await runCli(
      [
        'connectips',
        'import-pfx',
        'in.pfx',
        '--out',
        'keys/connectips.pem',
        '--cert-out',
        'keys/connectips.crt',
      ],
      h.ctx
    )

    expect(code).toBe(0)
    expect(h.files.get('keys/connectips.pem')).toContain(
      '-----BEGIN PRIVATE KEY-----'
    )
    expect(h.files.get('keys/connectips.crt')).toContain(
      '-----BEGIN CERTIFICATE-----'
    )
  })

  it('reads the password from stdin with --password-stdin', async () => {
    const { pfx } = loadTestPfx()
    const h = makeHarness({ stdin: `${TEST_PFX_PASSWORD}\n` })
    h.seedBytes('creditor.p12', pfx)

    const code = await runCli(
      ['connectips', 'import-pfx', 'creditor.p12', '--password-stdin'],
      h.ctx
    )

    expect(code).toBe(0)
    expect(h.files.get('creditor.key.pem')).toContain(
      '-----BEGIN PRIVATE KEY-----'
    )
  })

  it('fails without a password', async () => {
    const { pfx } = loadTestPfx()
    const h = makeHarness()
    h.seedBytes('creditor.pfx', pfx)

    const code = await runCli(
      ['connectips', 'import-pfx', 'creditor.pfx'],
      h.ctx
    )

    expect(code).toBe(2)
    expect(h.stderr.join('\n')).toMatch(/password/i)
  })

  it('fails on a wrong password', async () => {
    const { pfx } = loadTestPfx()
    const h = makeHarness({ env: { NPAY_PFX_PASSWORD: 'wrong' } })
    h.seedBytes('creditor.pfx', pfx)

    const code = await runCli(
      ['connectips', 'import-pfx', 'creditor.pfx'],
      h.ctx
    )

    expect(code).toBe(1)
    expect(h.stderr.join('\n')).toMatch(/PFX/i)
  })

  it('fails on a missing input file', async () => {
    const h = makeHarness({ env: { NPAY_PFX_PASSWORD: TEST_PFX_PASSWORD } })
    const code = await runCli(['connectips', 'import-pfx', 'nope.pfx'], h.ctx)
    expect(code).toBe(1)
    expect(h.stderr.join('\n')).toMatch(/cannot read/i)
  })

  it('refuses to overwrite without --force', async () => {
    const { pfx } = loadTestPfx()
    const h = makeHarness({ env: { NPAY_PFX_PASSWORD: TEST_PFX_PASSWORD } })
    h.seedBytes('creditor.pfx', pfx)
    h.seedFile('creditor.key.pem', 'existing')

    const blocked = await runCli(
      ['connectips', 'import-pfx', 'creditor.pfx'],
      h.ctx
    )
    expect(blocked).toBe(1)
    expect(h.files.get('creditor.key.pem')).toBe('existing')

    const forced = await runCli(
      ['connectips', 'import-pfx', 'creditor.pfx', '--force'],
      h.ctx
    )
    expect(forced).toBe(0)
    expect(h.files.get('creditor.key.pem')).toContain(
      '-----BEGIN PRIVATE KEY-----'
    )
  })

  it('exits 2 on a missing <pfx> argument and on unknown options', async () => {
    const missing = makeHarness({
      env: { NPAY_PFX_PASSWORD: TEST_PFX_PASSWORD },
    })
    expect(await runCli(['connectips', 'import-pfx'], missing.ctx)).toBe(2)

    const unknown = makeHarness({
      env: { NPAY_PFX_PASSWORD: TEST_PFX_PASSWORD },
    })
    expect(
      await runCli(['connectips', 'import-pfx', 'a.pfx', '--nope'], unknown.ctx)
    ).toBe(2)
  })

  it('prints help and exits 0', async () => {
    const h = makeHarness()
    const code = await runCli(['connectips', 'import-pfx', '--help'], h.ctx)
    expect(code).toBe(0)
    expect(h.stdout.join('\n')).toMatch(/Usage: npay connectips import-pfx/)
  })

  it('never echoes the password', async () => {
    const { pfx } = loadTestPfx()
    const h = makeHarness({ env: { NPAY_PFX_PASSWORD: TEST_PFX_PASSWORD } })
    h.seedBytes('creditor.pfx', pfx)
    await runCli(['connectips', 'import-pfx', 'creditor.pfx'], h.ctx)
    expect(h.stdout.join('\n')).not.toContain(TEST_PFX_PASSWORD)
    expect(h.stderr.join('\n')).not.toContain(TEST_PFX_PASSWORD)
  })
})

describe('npay dispatch', () => {
  it('shows root usage for no command and exits 1', async () => {
    const h = makeHarness()
    expect(await runCli([], h.ctx)).toBe(1)
    expect(h.stdout.join('\n')).toContain('npay')
  })

  it('exits 2 for an unknown command', async () => {
    const h = makeHarness()
    expect(await runCli(['nope'], h.ctx)).toBe(2)
    expect(h.stderr.join('\n')).toMatch(/unknown command/i)
  })

  it('uses the produced key to sign (smoke check)', async () => {
    const { pfx } = loadTestPfx()
    const h = makeHarness({ env: { NPAY_PFX_PASSWORD: TEST_PFX_PASSWORD } })
    h.seedBytes('creditor.pfx', pfx)
    await runCli(['connectips', 'import-pfx', 'creditor.pfx'], h.ctx)
    const key = await importPkcs8PrivateKey(
      h.files.get('creditor.key.pem') ?? ''
    )
    await expect(rsaSha256Sign('token', key)).resolves.toEqual(
      expect.any(String)
    )
  })
})
