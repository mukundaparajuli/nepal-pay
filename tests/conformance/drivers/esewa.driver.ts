import {
  createOrder,
  moneyFromDecimal,
  type CheckoutResult,
  type GatewayAdapter,
  type Order,
  type RawCallbackRequest,
  type TxnRef,
} from '@nepal-pay/core'
import { createEsewa, type EsewaConfig } from '@nepal-pay/esewa'
import {
  CALLBACK_SFN,
  SANDBOX_PRODUCT_CODE,
  SANDBOX_SECRET,
  callbackData,
  signCallbackPayload,
  stubFetch,
  type CallbackInput,
} from '../../esewa/helpers.js'
import { hangingFetch } from '../../khalti/helpers.js'
import type { GatewayConformanceDriver, NativeStatusSample } from '../driver.js'

const TXN_CODE = '0004T5I'
const ORDER_AMOUNT = '230.00'
const STATUS_TOTAL_AMOUNT = 230

export const esewaOrder: Order = createOrder({
  id: 'ORD-CONFORM-0001',
  amount: moneyFromDecimal(ORDER_AMOUNT),
})

const state: { paidUuid?: string; status: string } = { status: 'COMPLETE' }

function statusBody(uuid: string): unknown {
  const known = state.paidUuid !== undefined && uuid === state.paidUuid
  return {
    product_code: SANDBOX_PRODUCT_CODE,
    transaction_uuid: uuid,
    total_amount: STATUS_TOTAL_AMOUNT,
    status: known ? state.status : 'NOT_FOUND',
    ref_id: known ? TXN_CODE : null,
  }
}

const statusFetch = stubFetch((url) => {
  const uuid = new URL(url).searchParams.get('transaction_uuid')
  if (uuid === null) {
    return { status: 404, body: { error: 'missing transaction_uuid' } }
  }
  return { body: statusBody(uuid) }
}).fetch

function makeGateway(overrides: Partial<EsewaConfig> = {}): GatewayAdapter {
  return createEsewa({
    merchantCode: SANDBOX_PRODUCT_CODE,
    secret: SANDBOX_SECRET,
    environment: 'sandbox',
    successUrl: 'https://merchant.example/success',
    failureUrl: 'https://merchant.example/failure',
    fetch: statusFetch,
    ...overrides,
  })
}

async function signedCallback(
  txnRef: TxnRef,
  overrides: Partial<CallbackInput> = {},
  secret: string = SANDBOX_SECRET
): Promise<RawCallbackRequest> {
  const input: CallbackInput = {
    status: 'COMPLETE',
    transaction_code: TXN_CODE,
    total_amount: ORDER_AMOUNT,
    transaction_uuid: txnRef.id,
    product_code: SANDBOX_PRODUCT_CODE,
    signed_field_names: CALLBACK_SFN,
    ...overrides,
  }
  const signed = await signCallbackPayload(input, secret)
  return { query: { data: callbackData(signed) } }
}

const STATUS_SAMPLES: readonly NativeStatusSample[] = [
  { native: 'COMPLETE', unified: 'completed' },
  { native: 'PENDING', unified: 'pending' },
  { native: 'CANCELED', unified: 'canceled' },
  { native: 'NOT_FOUND', unified: 'unknown' },
  { native: 'FULL_REFUND', unified: 'unknown' },
  { native: 'PARTIAL_REFUND', unified: 'unknown' },
  { native: 'WEIRD_STATUS', unified: 'unknown' },
]

export const esewaConformanceDriver: GatewayConformanceDriver = {
  name: 'esewa',
  order: esewaOrder,

  createGateway(): GatewayAdapter {
    return makeGateway()
  },

  hangingGateway(): GatewayAdapter {
    return makeGateway({ fetch: hangingFetch(), timeoutMs: 50 })
  },

  async paidCheckout(gateway: GatewayAdapter): Promise<CheckoutResult> {
    const result = await gateway.createCheckout(esewaOrder)
    state.paidUuid = result.txnRef.id
    state.status = 'COMPLETE'
    return result
  },

  completedCallback(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return signedCallback(txnRef)
  },

  tamperedAmount(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return signedCallback(txnRef, { total_amount: '9999.00' })
  },

  tamperedOrder(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return signedCallback(txnRef, { transaction_uuid: 'ORD-TAMPERED' })
  },

  tamperedSignature(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return signedCallback(txnRef, {}, 'wrong-secret')
  },

  setUpstreamDisagreement(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<void> {
    state.paidUuid = txnRef.id
    state.status = 'PENDING'
    return Promise.resolve()
  },

  setStatus(
    _gateway: GatewayAdapter,
    txnRef: TxnRef,
    native: string
  ): Promise<void> {
    state.paidUuid = txnRef.id
    state.status = native
    return Promise.resolve()
  },

  unknownTxnRef: {
    id: '00000000-0000-4000-8000-000000000000',
    gateway: 'esewa',
  },
  unknownTransaction: { kind: 'seals', status: 'unknown' },
  disagreement: { kind: 'throws', code: 'INVALID_STATUS' },
  statusSamples: STATUS_SAMPLES,
  orderIdWithoutExpected: 'txnRef',
}
