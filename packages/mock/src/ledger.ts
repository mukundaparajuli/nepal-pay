import { VerificationError } from '@nepal-pay/core'
import type { MockLedgerEntry, MockLedgerStatus } from './types.js'

export class MockLedger {
  private readonly entries = new Map<string, MockLedgerEntry>()

  register(entry: MockLedgerEntry): void {
    this.entries.set(entry.txnId, entry)
  }

  get(txnId: string): MockLedgerEntry | undefined {
    return this.entries.get(txnId)
  }

  has(txnId: string): boolean {
    return this.entries.has(txnId)
  }

  get size(): number {
    return this.entries.size
  }

  transition(txnId: string, status: MockLedgerStatus): MockLedgerEntry {
    const current = this.entries.get(txnId)
    if (current === undefined) {
      throw new VerificationError(
        `Mock gateway has no record for transaction ${txnId}`,
        'UNKNOWN_TRANSACTION'
      )
    }
    const next: MockLedgerEntry = {
      ...current,
      status,
      updatedAt: Date.now(),
    }
    this.entries.set(txnId, next)
    return next
  }
}
