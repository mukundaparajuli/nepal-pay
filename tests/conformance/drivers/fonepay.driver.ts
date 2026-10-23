import {
  createOrder,
  moneyFromDecimal,
  type CheckoutResult,
  type GatewayAdapter,
  type Order,
  type RawCallbackRequest,
  type TxnRef,
} from '@nepal-pay/core'
import { createFonepay, type FonepayConfig } from '@nepal-pay/fonepay'
import {
  FIXED_DATE,
  FONEPAY_MERCHANT_CODE,
  FONEPAY_RETURN_URL,
  FONEPAY_SECRET,
  signedCallback,
} from '../../fonepay/helpers.js'
import { hangingFetch, stubRequest } from '../../khalti/helpers.js'
import type { GatewayConformanceDriver, NativeStatusSample } from '../driver.js'

export const fonepayOrder: Order = createOrder({
  id: 'ORD-CONFORM-0001',
  amount: moneyFromDecimal('230.00'),
  returnUrl: FONEPAY_RETURN_URL,
})

const knownPrns = new Set<string>()
let verificationText = 'success'

function makeFetch(): typeof globalThis.fetch {
  const { fetch } = stubRequest((url) => {
    const prn = new URL(url).searchParams.get('PRN')
    if (prn === null || !knownPrns.has(prn)) {
      return { text: 'error' }
    }
    return { text: verificationText }
  })
  return fetch
}

function makeGateway(overrides: Partial<FonepayConfig> = {}): GatewayAdapter {
  return createFonepay({
    merchantCode: FONEPAY_MERCHANT_CODE,
    secretKey: FONEPAY_SECRET,
    environment: 'sandbox',
    returnUrl: FONEPAY_RETURN_URL,
    now: () => FIXED_DATE,
    fetch: makeFetch(),
    ...overrides,
  })
}

const STATUS_SAMPLES: readonly NativeStatusSample[] = [
  { native: 'success', unified: 'completed' },
  { native: 'failure', unified: 'failed' },
  { native: 'error', unified: 'unknown' },
  { native: 'weird', unified: 'unknown' },
]

export const fonepayConformanceDriver: GatewayConformanceDriver = {
  name: 'fonepay',
  order: fonepayOrder,

  createGateway(): GatewayAdapter {
    return makeGateway()
  },

  hangingGateway(): GatewayAdapter {
    return makeGateway({ fetch: hangingFetch(), timeoutMs: 50 })
  },

  async paidCheckout(gateway: GatewayAdapter): Promise<CheckoutResult> {
    const result = await gateway.createCheckout(fonepayOrder)
    knownPrns.add(result.txnRef.id)
    verificationText = 'success'
    return result
  },

  completedCallback(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return signedCallback({ PRN: txnRef.id })
  },

  tamperedAmount(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return signedCallback({ PRN: txnRef.id, P_AMT: '9999.00' })
  },

  tamperedOrder(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return signedCallback({ PRN: `X${txnRef.id}`.slice(0, 20) })
  },

  tamperedSignature(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest> {
    return signedCallback({ PRN: txnRef.id }, 'wrong-secret')
  },

  setUpstreamDisagreement(
    _gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<void> {
    knownPrns.add(txnRef.id)
    verificationText = 'failure'
    return Promise.resolve()
  },

  setStatus(
    _gateway: GatewayAdapter,
    txnRef: TxnRef,
    native: string
  ): Promise<void> {
    knownPrns.add(txnRef.id)
    verificationText = native
    return Promise.resolve()
  },

  unknownTxnRef: { id: 'ORD-UNKNOWN-9999', gateway: 'fonepay' },
  unknownTransaction: { kind: 'seals', status: 'unknown' },
  disagreement: { kind: 'seals', status: 'failed' },
  statusSamples: STATUS_SAMPLES,
  orderIdWithoutExpected: 'txnRef',
  statusWithoutExpected: false,
}
