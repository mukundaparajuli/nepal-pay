import {
  createOrder,
  moneyFromDecimal,
  type CheckoutResult,
  type GatewayAdapter,
  type Order,
  type RawCallbackRequest,
  type TxnRef,
} from '@nepal-pay/core'
import { createConnectIps, type ConnectIpsConfig } from '@nepal-pay/connectips'
import { pfxToPkcs8Pem } from '@nepal-pay/connectips/pfx'
import {
  TEST_APP_ID,
  TEST_APP_NAME,
  TEST_MERCHANT_ID,
  TEST_PFX_PASSWORD,
  TEST_PASSWORD,
  FIXED_DATE,
  loadTestPfx,
} from '../../connectips/helpers.js'
import { hangingFetch, stubRequest } from '../../khalti/helpers.js'
import type { GatewayConformanceDriver, NativeStatusSample } from '../driver.js'

const ORDER_AMOUNT = '230.00'
const ORDER_AMOUNT_PAISA = '23000'
const TAMPERED_AMOUNT_PAISA = '999900'

export const connectIpsOrder: Order = createOrder({
  id: 'ORD-CONFORM-0001',
  amount: moneyFromDecimal(ORDER_AMOUNT),
})

const { privateKeyPem } = pfxToPkcs8Pem(loadTestPfx().pfx, TEST_PFX_PASSWORD)

interface LedgerEntry {
  readonly amountPaisa: string
  readonly validationStatus: string
  readonly detailStatus: string
  readonly creditStatus?: string
}

const ledger = new Map<string, LedgerEntry>()

function statusDesc(status: string): string {
  if (status === 'SUCCESS') return 'TRANSACTION SUCCESSFUL'
  if (status === 'FAILED') return 'TRANSACTION UNSUCCESSFUL'
  return 'TRANSACTION NOT FOUND'
}

function entryFor(txnId: string): LedgerEntry | undefined {
  return ledger.get(txnId)
}

function seed(txnId: string, entry: Partial<LedgerEntry> = {}): void {
  ledger.set(txnId, {
    amountPaisa: ORDER_AMOUNT_PAISA,
    validationStatus: 'SUCCESS',
    detailStatus: 'SUCCESS',
    creditStatus: '000',
    ...entry,
  })
}

function referenceIdFromBody(init?: RequestInit): string {
  if (typeof init?.body !== 'string') return ''
  try {
    const parsed = JSON.parse(init.body) as { referenceId?: unknown }
    return typeof parsed.referenceId === 'string' ? parsed.referenceId : ''
  } catch {
    return ''
  }
}

function makeFetch(): typeof globalThis.fetch {
  const { fetch } = stubRequest((url, init) => {
    const referenceId = referenceIdFromBody(init)
    const entry = entryFor(referenceId)
    if (entry === undefined) {
      return { body: { status: 'ERROR', statusDesc: statusDesc('ERROR') } }
    }
    const base = {
      merchantId: TEST_MERCHANT_ID,
      appId: TEST_APP_ID,
      referenceId,
      txnAmt: entry.amountPaisa,
    }
    if (url.includes('/gettxndetail')) {
      return {
        body: {
          ...base,
          status: entry.detailStatus,
          statusDesc: statusDesc(entry.detailStatus),
          txnId: 12422440,
          creditStatus: entry.creditStatus ?? '000',
        },
      }
    }
    return {
      body: {
        ...base,
        status: entry.validationStatus,
        statusDesc: statusDesc(entry.validationStatus),
        token: null,
      },
    }
  })
  return fetch
}

function makeGateway(
  overrides: Partial<ConnectIpsConfig> = {}
): GatewayAdapter {
  return createConnectIps({
    merchantId: TEST_MERCHANT_ID,
    appId: TEST_APP_ID,
    appName: TEST_APP_NAME,
    password: TEST_PASSWORD,
    privateKey: privateKeyPem,
    environment: 'sandbox',
    now: () => FIXED_DATE,
    fetch: makeFetch(),
    ...overrides,
  })
}

const STATUS_SAMPLES: readonly NativeStatusSample[] = [
  { native: 'SUCCESS', unified: 'completed' },
  { native: 'SUCCESS:999', unified: 'completed' },
  { native: 'SUCCESS:DEFER', unified: 'completed' },
  { native: 'SUCCESS:888', unified: 'failed' },
  { native: 'FAILED', unified: 'failed' },
  { native: 'ERROR', unified: 'unknown' },
  { native: 'WEIRD', unified: 'unknown' },
]

export const connectIpsConformanceDriver: GatewayConformanceDriver = {
  name: 'connectips',
  order: connectIpsOrder,

  createGateway(): GatewayAdapter {
    return makeGateway()
  },

  hangingGateway(): GatewayAdapter {
    return makeGateway({ fetch: hangingFetch(), timeoutMs: 50 })
  },

  async paidCheckout(gateway: GatewayAdapter): Promise<CheckoutResult> {
    const result = await gateway.createCheckout(connectIpsOrder)
    seed(result.txnRef.id)
    return result
  },

  completedCallback(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return Promise.resolve({ query: { TXNID: txnRef.id } })
  },

  tamperedAmount(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    seed(txnRef.id, { amountPaisa: TAMPERED_AMOUNT_PAISA })
    return Promise.resolve({ query: { TXNID: txnRef.id } })
  },

  tamperedOrder(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return Promise.resolve({ query: { TXNID: `${txnRef.id}X` } })
  },

  setUpstreamDisagreement(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<void> {
    seed(txnRef.id, {
      validationStatus: 'FAILED',
      detailStatus: 'FAILED',
      creditStatus: '888',
    })
    return Promise.resolve()
  },

  setStatus(
    _gateway: GatewayAdapter,
    txnRef: TxnRef,
    native: string
  ): Promise<void> {
    const [statusPart = 'SUCCESS', creditPart] = native.split(':')
    seed(txnRef.id, {
      validationStatus: statusPart,
      detailStatus: statusPart,
      creditStatus: creditPart ?? (statusPart === 'SUCCESS' ? '000' : ''),
    })
    return Promise.resolve()
  },

  unknownTxnRef: { id: 'ORD-UNKNOWN-9999', gateway: 'connectips' },
  unknownTransaction: { kind: 'seals', status: 'unknown' },
  disagreement: { kind: 'seals', status: 'failed' },
  statusSamples: STATUS_SAMPLES,
  orderIdWithoutExpected: 'txnRef',
}
