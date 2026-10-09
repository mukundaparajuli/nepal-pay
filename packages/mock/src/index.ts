import {
  PaymentError,
  safeBase64Encode,
  type CheckoutResult,
  type GatewayAdapter,
  type Order,
  type RawCallbackRequest,
  type TxnRef,
  type UnverifiedCallback,
  type VerifyOptions,
  type VerifiedPayment,
} from '@nepal-payments/core'
import type {
  MockCheckoutOptions,
  MockConfig,
  MockLedgerEntry,
  MockLedgerStatus,
  MockStatusOptions,
} from './types.js'
import { resolveMockConfig } from './config.js'
import { MockLedger } from './ledger.js'
import { parseMockCallback } from './callback.js'
import { buildMockCheckout } from './checkout.js'
import { checkMockStatus, verifyMockPayment } from './verify.js'
import { signMockCallback } from './signing.js'
import { TRANSACTION_ID_PATTERN } from './constants.js'

export class MockGateway implements GatewayAdapter {
  readonly name = 'mock' as const
  readonly config: ReturnType<typeof resolveMockConfig>
  readonly ledger: MockLedger

  constructor(input: MockConfig) {
    this.config = resolveMockConfig(input)
    this.ledger = new MockLedger()
  }

  async createCheckout(
    order: Order,
    options?: MockCheckoutOptions
  ): Promise<CheckoutResult> {
    const built = buildMockCheckout(this.config, this.ledger, order, options)
    return { checkout: built.checkout, txnRef: built.txnRef }
  }

  parseCallback(request: RawCallbackRequest): UnverifiedCallback {
    return parseMockCallback(request)
  }

  verify(
    callback: UnverifiedCallback,
    options: VerifyOptions
  ): Promise<VerifiedPayment> {
    return verifyMockPayment(
      this.config,
      this.ledger,
      callback,
      options.expected
    )
  }

  status(
    txnRef: TxnRef,
    options?: MockStatusOptions
  ): Promise<VerifiedPayment> {
    return checkMockStatus(this.config, this.ledger, txnRef, options)
  }

  // -------- scenario controls --------

  private entry(txnRef: TxnRef): MockLedgerEntry {
    if (txnRef.gateway !== 'mock') {
      throw new PaymentError(
        `Unexpected gateway for mock controls: ${String(txnRef.gateway)}`,
        'GATEWAY_MISMATCH'
      )
    }
    if (!TRANSACTION_ID_PATTERN.test(txnRef.id)) {
      throw new PaymentError(
        'Mock transaction id must be alphanumeric or hyphens',
        'INVALID_TXN_REF'
      )
    }
    const found = this.ledger.get(txnRef.id)
    if (found === undefined) {
      throw new PaymentError(
        `Mock gateway has no record for transaction ${txnRef.id}`,
        'UNKNOWN_TRANSACTION'
      )
    }
    return found
  }

  /** Simulates the payer completing checkout on the gateway side. */
  async pay(txnRef: TxnRef): Promise<MockLedgerEntry> {
    const scenario = this.config.scenario
    let target: MockLedgerStatus
    switch (scenario) {
      case 'success':
      case 'delayed':
      case 'duplicate':
      case 'invalid-signature':
      case 'timeout':
        target = 'completed'
        break
      case 'pending':
        target = 'pending'
        break
      case 'failed':
        target = 'failed'
        break
      case 'expired':
        target = 'expired'
        break
      case 'abandoned':
        target = 'initiated'
        break
      default:
        target = 'completed'
    }
    return this.ledger.transition(txnRef.id, target)
  }

  /** Advances a pending transaction to completed (delayed settlement). */
  async settle(txnRef: TxnRef): Promise<MockLedgerEntry> {
    const current = this.entry(txnRef)
    if (current.status !== 'pending') {
      throw new PaymentError(
        `Cannot settle a transaction in status ${current.status}`,
        'INVALID_STATUS'
      )
    }
    return this.ledger.transition(txnRef.id, 'completed')
  }

  /** Marks an abandoned (never-paid) link as expired. */
  async expire(txnRef: TxnRef): Promise<MockLedgerEntry> {
    const current = this.entry(txnRef)
    if (current.status !== 'initiated' && current.status !== 'pending') {
      throw new PaymentError(
        `Cannot expire a transaction in status ${current.status}`,
        'INVALID_STATUS'
      )
    }
    return this.ledger.transition(txnRef.id, 'expired')
  }

  /** Forces an arbitrary ledger state (edges: canceled, unknown). */
  async setStatus(
    txnRef: TxnRef,
    status: MockLedgerStatus
  ): Promise<MockLedgerEntry> {
    this.entry(txnRef)
    return this.ledger.transition(txnRef.id, status)
  }

  /** Emits the gateway's redirect callback for a paid transaction. */
  async generateCallback(
    txnRef: TxnRef,
    options?: { readonly user?: string }
  ): Promise<RawCallbackRequest> {
    const current = this.entry(txnRef)
    if (current.status === 'initiated') {
      throw new PaymentError(
        'Mock transaction was never paid; no callback is emitted',
        'UNKNOWN_TRANSACTION'
      )
    }
    if (this.config.scenario === 'delayed' && this.config.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.delayMs))
    }

    const values = {
      txn_id: current.txnId,
      order_id: current.orderId,
      amount: current.amount.toString(),
      status: current.status,
    }
    const signature =
      this.config.scenario === 'invalid-signature'
        ? await signMockCallback(values, `${this.config.secretKey}-forged`)
        : await signMockCallback(values, this.config.secretKey)

    const payload = { ...values, signature }
    if (options?.user !== undefined) {
      ;(payload as Record<string, string>).user = options.user
    }
    return {
      query: { data: safeBase64Encode(JSON.stringify(payload)) },
      headers: { 'x-mock-txn': current.txnId },
    }
  }
}

export function createMockGateway(input: MockConfig): MockGateway {
  return new MockGateway(input)
}

export * from './types.js'
export { mapMockStatus } from './status.js'
export { parseMockCallback } from './callback.js'
export { MockLedger } from './ledger.js'
export {
  buildMockSignatureMessage,
  signMockCallback,
  verifyMockSignature,
} from './signing.js'
export { TRANSACTION_ID_PATTERN } from './constants.js'
export { resolveMockConfig, mockMoneyFromPaisa } from './config.js'
