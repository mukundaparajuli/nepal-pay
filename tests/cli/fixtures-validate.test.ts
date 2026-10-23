import { describe, it, expect } from 'vitest'
import { createNodeContext, runCli, validateFixtures } from '@nepal-pay/cli'
import { makeHarness } from './harness.js'

function seedValidTree(h: ReturnType<typeof makeHarness>): void {
  h.seedFile(
    'tests/vectors/statuses/statuses.json',
    JSON.stringify({ cases: [{ input: 'COMPLETE', expected: 'completed' }] })
  )
  h.seedFile(
    'tests/vectors/amounts/amounts.json',
    JSON.stringify({
      cases: [
        { input: '1', error: 'INVALID_AMOUNT' },
        { input: '2', error: null },
      ],
    })
  )
  h.seedFile(
    'tests/vectors/callbacks/callback.json',
    JSON.stringify({
      request: { query: {} },
      expectedParse: { orderId: 'x' },
      malformed: [
        { name: 'x', request: { query: {} }, error: 'MALFORMED_CALLBACK' },
      ],
    })
  )
  h.seedFile(
    'tests/vectors/signatures/sig.json',
    JSON.stringify({ secret: 'x', cases: [{ name: 'a' }] })
  )
  h.seedFile('tests/fixtures/plain.json', JSON.stringify({ ok: true }))
}

describe('validateFixtures', () => {
  it('accepts a valid virtual fixture tree', async () => {
    const h = makeHarness()
    seedValidTree(h)
    expect(await validateFixtures('tests', h.ctx)).toEqual([])
  })

  it('rejects invalid JSON', async () => {
    const h = makeHarness()
    h.seedFile('tests/vectors/amounts/broken.json', '{')
    const problems = await validateFixtures('tests', h.ctx)
    expect(problems).toHaveLength(1)
    expect(problems[0]?.message).toMatch(/invalid JSON/i)
  })

  it('rejects an unknown error code', async () => {
    const h = makeHarness()
    h.seedFile(
      'tests/vectors/amounts/a.json',
      JSON.stringify({ cases: [{ input: '1', error: 'NOT_A_CODE' }] })
    )
    const problems = await validateFixtures('tests', h.ctx)
    expect(problems.some((p) => /NOT_A_CODE/.test(p.message))).toBe(true)
  })

  it('rejects a malformed callback case without a request', async () => {
    const h = makeHarness()
    h.seedFile(
      'tests/vectors/callbacks/c.json',
      JSON.stringify({
        request: {},
        expectedParse: {},
        malformed: [{ name: 'x', error: 'MALFORMED_CALLBACK' }],
      })
    )
    const problems = await validateFixtures('tests', h.ctx)
    expect(problems.some((p) => /malformed\[0\]/.test(p.message))).toBe(true)
  })

  it('rejects an unknown status', async () => {
    const h = makeHarness()
    h.seedFile(
      'tests/vectors/statuses/s.json',
      JSON.stringify({ cases: [{ input: 'X', expected: 'done' }] })
    )
    const problems = await validateFixtures('tests', h.ctx)
    expect(problems.some((p) => /known status/.test(p.message))).toBe(true)
  })

  it('reports an unreadable directory', async () => {
    const h = makeHarness()
    const problems = await validateFixtures('nope', h.ctx)
    expect(problems[0]?.message).toMatch(/cannot read directory/i)
  })
})

describe('npay fixtures validate', () => {
  it('exits 0 for a valid tree', async () => {
    const h = makeHarness()
    seedValidTree(h)
    expect(await runCli(['fixtures', 'validate', 'tests'], h.ctx)).toBe(0)
    expect(h.stdout.join('\n')).toMatch(/OK/)
  })

  it('exits 1 when a fixture is invalid', async () => {
    const h = makeHarness()
    h.seedFile('tests/vectors/amounts/a.json', '{')
    expect(await runCli(['fixtures', 'validate', 'tests'], h.ctx)).toBe(1)
    expect(h.stderr.join('\n')).toMatch(/FAIL/)
  })

  it('prints help and exits 0', async () => {
    const h = makeHarness()
    expect(await runCli(['fixtures', 'validate', '--help'], h.ctx)).toBe(0)
    expect(h.stdout.join('\n')).toMatch(/Usage: npay fixtures validate/)
  })

  it('exits 2 for extra positional arguments', async () => {
    const h = makeHarness()
    expect(await runCli(['fixtures', 'validate', 'a', 'b'], h.ctx)).toBe(2)
  })

  it('validates the real repository fixtures', async () => {
    const code = await runCli(['fixtures', 'validate'], createNodeContext())
    expect(code).toBe(0)
  })
})
