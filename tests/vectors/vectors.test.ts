import { describe, it, expect } from 'vitest'
import {
  createMoney,
  moneyFromDecimal,
  moneyToDecimal,
  PAYMENT_STATUSES,
  PaymentError,
  type NepalPayError,
} from '@nepal-pay/core'
import {
  buildSignatureMessage,
  createEsewa,
  mapEsewaStatus,
  signFields,
  verifySignedFields,
} from '@nepal-pay/esewa'
import {
  createKhalti,
  khaltiPaisaToMoney,
  mapKhaltiStatus,
} from '@nepal-pay/khalti'
import {
  buildMockSignatureMessage,
  createMockGateway,
  mapMockStatus,
  signMockCallback,
  verifyMockSignature,
} from '@nepal-pay/mock'
import type { RawCallbackRequest } from '@nepal-pay/core'
import * as esewaExports from '@nepal-pay/esewa'
import * as khaltiExports from '@nepal-pay/khalti'
import * as mockExports from '@nepal-pay/mock'

import schemes from './signatures/schemes.json'
import esewaDemoSignatures from './signatures/esewa-demo.json'
import mockHmacSignatures from './signatures/mock-hmac.json'
import esewaComplete from './callbacks/esewa-complete.json'
import khaltiCompleted from './callbacks/khalti-completed.json'
import khaltiUserCanceled from './callbacks/khalti-user-canceled.json'
import mockSuccess from './callbacks/mock-success.json'
import precisionScaling from './amounts/precision-scaling.json'
import boundaries from './amounts/boundaries.json'
import invalidAmounts from './amounts/invalid.json'
import statusesUnified from './statuses/unified.json'
import statusesEsewa from './statuses/esewa.json'
import statusesKhalti from './statuses/khalti.json'
import statusesMock from './statuses/mock.json'

function codeOf(error: unknown): string | undefined {
  return (error as NepalPayError)?.code
}

async function capture(fn: () => unknown | Promise<unknown>): Promise<unknown> {
  try {
    await fn()
    return undefined
  } catch (error) {
    return error
  }
}

describe('vectors: signature schemes', () => {
  it('declares signature schemes consistently with the gateway exports', () => {
    expect(schemes.esewa.signed).toBe(true)
    expect(schemes.esewa.encoding).toBe('base64')
    expect(schemes.mock.signed).toBe(true)
    expect(schemes.mock.encoding).toBe('hex')
    expect(schemes.khalti.signed).toBe(false)

    expect(typeof esewaExports.signFields).toBe('function')
    expect(typeof esewaExports.verifySignedFields).toBe('function')
    expect(typeof mockExports.signMockCallback).toBe('function')
    expect(typeof mockExports.verifyMockSignature).toBe('function')
    expect('signKhaltiCallback' in khaltiExports).toBe(false)
    expect('signKhalti' in khaltiExports).toBe(false)
  })
})

describe('vectors: eSewa signature vectors', () => {
  for (const testCase of esewaDemoSignatures.cases) {
    it(`builds the message for "${testCase.name}"`, () => {
      const values = testCase.values as Record<string, string>
      const message = buildSignatureMessage(values, testCase.signed_field_names)
      expect(message).toBe(testCase.message)
    })

    it(`signs "${testCase.name}" with the sandbox secret`, async () => {
      const values = testCase.values as Record<string, string>
      const signature = await signFields(
        values,
        testCase.signed_field_names,
        esewaDemoSignatures.secret
      )
      expect(signature).toBe(testCase.expected_signature)
      const ok = await verifySignedFields(
        values,
        testCase.signed_field_names,
        esewaDemoSignatures.secret,
        testCase.expected_signature
      )
      expect(ok).toBe(true)
      const tampered = await verifySignedFields(
        { ...values, total_amount: '999.99' },
        testCase.signed_field_names,
        esewaDemoSignatures.secret,
        testCase.expected_signature
      )
      expect(tampered).toBe(false)
    })
  }
})

describe('vectors: mock signature vectors', () => {
  for (const testCase of mockHmacSignatures.cases) {
    it(`builds the message for "${testCase.name}"`, () => {
      expect(buildMockSignatureMessage(testCase.values)).toBe(testCase.message)
    })

    it(`signs "${testCase.name}"`, async () => {
      const signature = await signMockCallback(
        testCase.values,
        mockHmacSignatures.secret
      )
      expect(signature).toBe(testCase.expected_signature)
      expect(
        await verifyMockSignature(
          testCase.values,
          mockHmacSignatures.secret,
          testCase.expected_signature
        )
      ).toBe(true)
    })
  }

  for (const crossCheck of mockHmacSignatures.crossChecks) {
    it(`rejects "${crossCheck.name}"`, async () => {
      const cross = crossCheck as {
        valid_signature?: string
        tampered_message?: string
        signature?: string
      }
      const values =
        cross.tampered_message !== undefined
          ? mockHmacSignatures.cases[1]?.values
          : mockHmacSignatures.cases[0]?.values
      const signature = cross.valid_signature ?? cross.signature
      expect(values).toBeDefined()
      expect(signature).toBeDefined()
      if (values === undefined || signature === undefined) return
      expect(
        await verifyMockSignature(values, mockHmacSignatures.secret, signature)
      ).toBe(false)
    })
  }
})

function parseWith(vector: {
  gateway: string
  request: unknown
}): import('@nepal-pay/core').UnverifiedCallback {
  const request = vector.request as unknown as RawCallbackRequest
  if (vector.gateway === 'esewa') {
    return createEsewa({
      merchantCode: 'EPAYTEST',
      secret: '8gBm/:&EnhH.1/q',
      environment: 'sandbox',
    }).parseCallback(request)
  }
  if (vector.gateway === 'khalti') {
    return createKhalti({
      secretKey: 'sk_test_0123456789abcdef0123456789abcdef',
      environment: 'sandbox',
    }).parseCallback(request)
  }
  return createMockGateway({ secretKey: 'vector-secret' }).parseCallback(
    request
  )
}

describe('vectors: callback payloads', () => {
  const vectors: ReadonlyArray<{
    readonly gateway: string
    readonly request: unknown
    readonly expectedParse: Record<string, unknown>
  }> = [esewaComplete, khaltiCompleted, khaltiUserCanceled, mockSuccess]

  for (const vector of vectors) {
    it(`parses a valid ${vector.gateway} callback`, () => {
      const callback = parseWith(vector)
      expect(callback.gateway).toBe(vector.gateway)
      expect(callback.data).toBeDefined()
      const expected = vector.expectedParse
      if (vector.gateway === 'esewa') {
        expect(callback.data['transaction_uuid']).toBe(expected['orderId'])
        expect(callback.data['status']).toBe(expected['statusToken'])
        expect(callback.data['signature']).toBeDefined()
        expect(callback.data['signed_field_names']).toBe(
          expected['signedFieldNames']
        )
      } else if (vector.gateway === 'khalti') {
        expect(callback.data['pidx']).toBe(expected['pidx'])
        expect(callback.data['status']).toBe(expected['status'])
        expect(callback.data['total_amount']).toBe(expected['totalAmount'])
        expect(callback.data['transaction_id']).toBe(expected['transactionId'])
        expect(callback.data['purchase_order_id']).toBe(
          expected['purchaseOrderId']
        )
      } else {
        expect(callback.data['txn_id']).toBe(expected['txnId'])
        expect(callback.data['order_id']).toBe(expected['orderId'])
        expect(callback.data['amount']).toBe(expected['amount'])
        expect(callback.data['status']).toBe(expected['status'])
        expect(String(callback.data['signature'])).toHaveLength(
          expected['signatureLength'] as number
        )
      }
    })
  }

  const malformed = [
    ...esewaComplete.malformed.map((entry) => ({
      gateway: 'esewa',
      entry,
    })),
    ...khaltiCompleted.malformed.map((entry) => ({
      gateway: 'khalti',
      entry,
    })),
    ...mockSuccess.malformed.map((entry) => ({
      gateway: 'mock',
      entry,
    })),
  ]

  for (const { gateway, entry } of malformed) {
    it(`rejects a ${gateway} callback: ${entry.name}`, async () => {
      const error = await capture(() =>
        parseWith({ gateway, request: entry.request })
      )
      expect(error).toBeInstanceOf(PaymentError)
      expect(codeOf(error)).toBe(entry.error)
    })
  }
})

describe('vectors: amount precision scaling', () => {
  for (const testCase of precisionScaling.cases) {
    it(`converts ${testCase.decimal} (precision ${testCase.precision}) to units and paisa`, () => {
      const money = moneyFromDecimal(
        testCase.decimal,
        'NPR',
        testCase.precision
      )
      expect(money.amount.toString()).toBe(testCase.units)
      expect(moneyToDecimal(money)).toBe(testCase.decimal)
      const paisa = money.amount * 10n ** BigInt(2 - testCase.precision)
      expect(paisa.toString()).toBe(testCase.paisa)
      const khaltiMoney = khaltiPaisaToMoney(Number(paisa))
      expect(khaltiMoney.amount).toBe(paisa)
      expect(khaltiMoney.precision).toBe(2)
    })
  }
})

describe('vectors: amount boundaries', () => {
  const stubFetch = (() =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          pidx: 'bZQLD9wRVWo4CdESSfuSsB',
          payment_url:
            'https://test-pay.khalti.com/?pidx=bZQLD9wRVWo4CdESSfuSsB',
        }),
    })) as unknown as typeof globalThis.fetch

  for (const testCase of boundaries.cases) {
    it(`enforces ${testCase.name}`, async () => {
      const money = moneyFromDecimal(testCase.decimal, 'NPR', 2)
      expect(money.amount.toString()).toBe(testCase.paisa)

      const mock = createMockGateway({ secretKey: 'vector-secret' })
      const mockResult = await capture(() =>
        mock.createCheckout({ id: 'ORD-VECTOR', amount: money })
      )
      expect(mockResult === undefined).toBe(testCase.mockValid)

      const khalti = createKhalti({
        secretKey: 'sk_test_0123456789abcdef0123456789abcdef',
        environment: 'sandbox',
        returnUrl: 'https://merchant.example/return',
        fetch: stubFetch,
      })
      const khaltiResult = await capture(() =>
        khalti.createCheckout({ id: 'ORD-VECTOR', amount: money })
      )
      expect(khaltiResult === undefined).toBe(testCase.khaltiValid)
    })
  }

  for (const testCase of boundaries.precision) {
    it(`mock precision ${testCase.precision} is ${testCase.mockValid ? 'accepted' : 'rejected'}`, async () => {
      const mock = createMockGateway({ secretKey: 'vector-secret' })
      const units =
        testCase.precision === 0 ? 1n : testCase.precision === 2 ? 1n : 123450n
      const result = await capture(() =>
        mock.createCheckout({
          id: 'ORD-VECTOR',
          amount: createMoney(units, 'NPR', testCase.precision),
        })
      )
      expect(result === undefined).toBe(testCase.mockValid)
    })
  }
})

describe('vectors: invalid amounts', () => {
  for (const testCase of invalidAmounts.moneyFromDecimal_precision2) {
    it(`moneyFromDecimal(${JSON.stringify(testCase.input)}) rejects with ${String(testCase.error)}`, async () => {
      const error = await capture(() =>
        moneyFromDecimal(testCase.input, 'NPR', 2)
      )
      if (testCase.error === null) {
        expect(error).toBeUndefined()
      } else {
        expect(codeOf(error)).toBe(testCase.error)
      }
    })
  }

  for (const testCase of invalidAmounts.createMoney_number) {
    it(`createMoney(${testCase.input}) rejects with ${String(testCase.error)}`, async () => {
      const error = await capture(() => createMoney(testCase.input, 'NPR', 2))
      if (testCase.error === null) {
        expect(error).toBeUndefined()
      } else {
        expect(codeOf(error)).toBe(testCase.error)
      }
    })
  }

  for (const testCase of invalidAmounts.khaltiPaisaToMoney) {
    it(`khaltiPaisaToMoney(${JSON.stringify(testCase.input)}) rejects with ${String(testCase.error)}`, async () => {
      const error = await capture(() => khaltiPaisaToMoney(testCase.input))
      if (testCase.error === null) {
        expect(error).toBeUndefined()
      } else {
        expect(codeOf(error)).toBe(testCase.error)
      }
    })
  }
})

describe('vectors: status normalization', () => {
  it('the unified status set is unchanged', () => {
    expect([...PAYMENT_STATUSES]).toEqual(statusesUnified.statuses)
  })

  for (const testCase of statusesEsewa.cases) {
    it(`maps eSewa ${JSON.stringify(testCase.input)} to ${testCase.expected}`, () => {
      expect(mapEsewaStatus(testCase.input)).toBe(testCase.expected)
      expect(PAYMENT_STATUSES).toContain(mapEsewaStatus(testCase.input))
    })
  }

  for (const testCase of statusesKhalti.cases) {
    it(`maps Khalti ${JSON.stringify(testCase.input)} to ${testCase.expected}`, () => {
      expect(mapKhaltiStatus(testCase.input)).toBe(testCase.expected)
      expect(PAYMENT_STATUSES).toContain(mapKhaltiStatus(testCase.input))
    })
  }

  for (const testCase of statusesMock.cases) {
    it(`maps mock ${JSON.stringify(testCase.input)} to ${testCase.expected}`, () => {
      expect(mapMockStatus(testCase.input)).toBe(testCase.expected)
      expect(PAYMENT_STATUSES).toContain(mapMockStatus(testCase.input))
    })
  }
})
