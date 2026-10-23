import {
  createOrder,
  moneyFromDecimal,
  type CheckoutResult,
  type GatewayAdapter,
  type Order,
  type RawCallbackRequest,
  type TxnRef,
} from '@nepal-pay/core'
import {
  createMockGateway,
  signMockCallback,
  type MockGateway,
} from '@nepal-pay/mock'
import type { GatewayConformanceDriver, NativeStatusSample } from '../driver.js'

const SECRET = 'conformance-mock-secret'
const PAISA = '23000'

export const mockOrder: Order = createOrder({
  id: 'ORD-CONFORM-0001',
  amount: moneyFromDecimal('230.00'),
})

interface MockValues {
  readonly txn_id: string
  readonly order_id: string
  readonly amount: string
  readonly status: string
}

async function mockRaw(
  values: MockValues,
  secret: string = SECRET
): Promise<RawCallbackRequest> {
  const signature = await signMockCallback(values, secret)
  return {
    query: {
      data: Buffer.from(
        JSON.stringify({ ...values, signature }),
        'utf8'
      ).toString('base64'),
    },
  }
}

const STATUS_SAMPLES: readonly NativeStatusSample[] = [
  { native: 'completed', unified: 'completed' },
  { native: 'pending', unified: 'pending' },
  { native: 'initiated', unified: 'pending' },
  { native: 'failed', unified: 'failed' },
  { native: 'canceled', unified: 'canceled' },
  { native: 'expired', unified: 'expired' },
]

function controls(gateway: GatewayAdapter): MockGateway {
  return gateway as MockGateway
}

export const mockConformanceDriver: GatewayConformanceDriver = {
  name: 'mock',
  order: mockOrder,

  createGateway(): GatewayAdapter {
    return createMockGateway({ secretKey: SECRET, scenario: 'success' })
  },

  hangingGateway(): GatewayAdapter {
    return createMockGateway({
      secretKey: SECRET,
      scenario: 'timeout',
      timeoutMs: 50,
    })
  },

  async paidCheckout(gateway: GatewayAdapter): Promise<CheckoutResult> {
    const result = await gateway.createCheckout(mockOrder)
    await controls(gateway).pay(result.txnRef)
    return result
  },

  async completedCallback(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return mockRaw({
      txn_id: txnRef.id,
      order_id: mockOrder.id,
      amount: PAISA,
      status: 'completed',
    })
  },

  async tamperedAmount(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return mockRaw({
      txn_id: txnRef.id,
      order_id: mockOrder.id,
      amount: '99900',
      status: 'completed',
    })
  },

  async tamperedOrder(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return mockRaw({
      txn_id: txnRef.id,
      order_id: 'ORD-TAMPERED',
      amount: PAISA,
      status: 'completed',
    })
  },

  async tamperedSignature(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return mockRaw(
      {
        txn_id: txnRef.id,
        order_id: mockOrder.id,
        amount: PAISA,
        status: 'completed',
      },
      'wrong-secret'
    )
  },

  async setUpstreamDisagreement(
    gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<void> {
    await controls(gateway).setStatus(txnRef, 'pending')
  },

  async setStatus(
    gateway: GatewayAdapter,
    txnRef: TxnRef,
    native: string
  ): Promise<void> {
    await controls(gateway).setStatus(txnRef, native as never)
  },

  unknownTxnRef: { id: 'mock_unknown_0001', gateway: 'mock' },
  unknownTransaction: { kind: 'throws', code: 'UNKNOWN_TRANSACTION' },
  disagreement: { kind: 'seals', status: 'pending' },
  statusSamples: STATUS_SAMPLES,
  orderIdWithoutExpected: 'order',
}
