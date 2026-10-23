import {
  createOrder,
  moneyFromDecimal,
  type CheckoutResult,
  type GatewayAdapter,
  type Order,
  type RawCallbackRequest,
  type TxnRef,
} from '@nepal-pay/core'
import { createKhalti, type KhaltiConfig } from '@nepal-pay/khalti'
import { hangingFetch, stubRequest } from '../../khalti/helpers.js'
import type { GatewayConformanceDriver, NativeStatusSample } from '../driver.js'

const SECRET = 'sk_test_conformance0000000000000000000'
const PAISA = 23000
const COMPLETED_TXN_ID = 'GFq9PFS7b2iYvL8Lir9oXe'

export const khaltiOrder: Order = createOrder({
  id: 'ORD-CONFORM-0001',
  amount: moneyFromDecimal('230.00'),
})

interface LookupEntry {
  readonly body: Record<string, unknown>
  readonly httpStatus: number
}

const lookups = new Map<string, LookupEntry>()
let pidxSeq = 0

function lookupBody(
  pidx: string,
  status: string,
  purchaseOrderId: string
): Record<string, unknown> {
  return {
    pidx,
    status,
    total_amount: PAISA,
    transaction_id: COMPLETED_TXN_ID,
    fee: 0,
    refunded: false,
    purchase_order_id: purchaseOrderId,
  }
}

function parseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return {}
  }
  return {}
}

const khaltiFetch = stubRequest((url, init) => {
  if (url.includes('/initiate')) {
    pidxSeq += 1
    const pidx = `pidxconf${pidxSeq}`
    const request = parseJson(init?.body)
    const purchaseOrderId =
      typeof request.purchase_order_id === 'string'
        ? request.purchase_order_id
        : khaltiOrder.id
    lookups.set(pidx, {
      httpStatus: 200,
      body: lookupBody(pidx, 'Completed', purchaseOrderId),
    })
    return {
      body: {
        pidx,
        payment_url: `https://test-pay.khalti.com/?pidx=${pidx}`,
        expires_in: 1800,
      },
    }
  }

  const request = parseJson(init?.body)
  const pidx = typeof request.pidx === 'string' ? request.pidx : ''
  const entry = lookups.get(pidx)
  if (entry === undefined) {
    return {
      status: 404,
      body: { detail: 'Not found.', error_key: 'validation_error' },
    }
  }
  return { status: entry.httpStatus, body: entry.body }
}).fetch

function makeGateway(overrides: Partial<KhaltiConfig> = {}): GatewayAdapter {
  return createKhalti({
    secretKey: SECRET,
    environment: 'sandbox',
    returnUrl: 'https://merchant.example/callback',
    websiteUrl: 'https://merchant.example',
    fetch: khaltiFetch,
    ...overrides,
  })
}

function khaltiRaw(query: Record<string, string>): RawCallbackRequest {
  return { query }
}

const STATUS_SAMPLES: readonly NativeStatusSample[] = [
  { native: 'Completed', unified: 'completed' },
  { native: 'Pending', unified: 'pending' },
  { native: 'Initiated', unified: 'pending' },
  { native: 'User canceled', unified: 'canceled' },
  { native: 'Expired', unified: 'expired' },
  { native: 'Refunded', unified: 'unknown' },
  { native: 'Partially refunded', unified: 'unknown' },
  { native: 'Weird status', unified: 'unknown' },
]

export const khaltiConformanceDriver: GatewayConformanceDriver = {
  name: 'khalti',
  order: khaltiOrder,

  createGateway(): GatewayAdapter {
    return makeGateway()
  },

  hangingGateway(): GatewayAdapter {
    return makeGateway({ fetch: hangingFetch(), timeoutMs: 50 })
  },

  async paidCheckout(gateway: GatewayAdapter): Promise<CheckoutResult> {
    return gateway.createCheckout(khaltiOrder)
  },

  completedCallback(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return Promise.resolve(
      khaltiRaw({
        pidx: txnRef.id,
        status: 'Completed',
        transaction_id: COMPLETED_TXN_ID,
        tidx: 'tidxconformance01',
        amount: String(PAISA),
        total_amount: String(PAISA),
        mobile: '9800000000',
        purchase_order_id: khaltiOrder.id,
        purchase_order_name: 'Conformance order',
      })
    )
  },

  tamperedAmount(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return Promise.resolve(
      khaltiRaw({
        pidx: txnRef.id,
        status: 'Completed',
        transaction_id: COMPLETED_TXN_ID,
        amount: '99900',
        total_amount: '99900',
        purchase_order_id: khaltiOrder.id,
        purchase_order_name: 'Conformance order',
      })
    )
  },

  tamperedOrder(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return Promise.resolve(
      khaltiRaw({
        pidx: txnRef.id,
        status: 'Completed',
        transaction_id: COMPLETED_TXN_ID,
        amount: String(PAISA),
        total_amount: String(PAISA),
        purchase_order_id: 'ORD-TAMPERED',
        purchase_order_name: 'Conformance order',
      })
    )
  },

  async setUpstreamDisagreement(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<void> {
    lookups.set(txnRef.id, {
      httpStatus: 200,
      body: lookupBody(txnRef.id, 'Pending', khaltiOrder.id),
    })
  },

  async setStatus(
    _gateway: GatewayAdapter,
    txnRef: TxnRef,
    native: string
  ): Promise<void> {
    lookups.set(txnRef.id, {
      httpStatus:
        native === 'Expired' || native === 'User canceled' ? 400 : 200,
      body: lookupBody(txnRef.id, native, khaltiOrder.id),
    })
  },

  unknownTxnRef: { id: 'unknownpidx12345', gateway: 'khalti' },
  unknownTransaction: { kind: 'throws', code: 'UNKNOWN_TRANSACTION' },
  disagreement: { kind: 'seals', status: 'pending' },
  statusSamples: STATUS_SAMPLES,
  orderIdWithoutExpected: 'order',
}
