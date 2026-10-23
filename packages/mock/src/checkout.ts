import { PaymentError, type Order, type TxnRef } from '@nepal-pay/core'
import type {
  MockLedgerEntry,
  MockLedgerStatus,
  ResolvedMockConfig,
} from './types.js'
import type { MockCheckoutOptions } from './types.js'
import { amountToPaisa, mockTxnId } from './config.js'
import { TRANSACTION_ID_PATTERN } from './constants.js'
import type { MockLedger } from './ledger.js'

export interface BuiltMockCheckout {
  readonly checkout: { readonly type: 'redirect'; readonly url: string }
  readonly txnRef: TxnRef
  readonly entry: MockLedgerEntry
}

function initialStatusFor(scenario: string): MockLedgerStatus {
  return scenario === 'expired' ? 'expired' : 'initiated'
}

export function buildMockCheckout(
  config: ResolvedMockConfig,
  ledger: MockLedger,
  order: Order,
  options?: MockCheckoutOptions
): BuiltMockCheckout {
  const paisa = amountToPaisa(order.amount)
  let txnId = options?.txnId
  if (txnId !== undefined && !TRANSACTION_ID_PATTERN.test(txnId)) {
    throw new PaymentError(
      'Mock txn id must be alphanumeric or hyphens',
      'INVALID_TXN_REF'
    )
  }
  txnId = txnId ?? mockTxnId()
  const scenario = options?.scenario ?? config.scenario
  const now = Date.now()
  const entry: MockLedgerEntry = {
    txnId,
    orderId: order.id,
    amount: paisa,
    status: initialStatusFor(scenario),
    createdAt: now,
    updatedAt: now,
  }
  ledger.register(entry)
  const url = `${config.checkoutUrl}/code/${txnId}`
  return {
    checkout: { type: 'redirect', url },
    txnRef: { id: txnId, gateway: 'mock' },
    entry,
  }
}
