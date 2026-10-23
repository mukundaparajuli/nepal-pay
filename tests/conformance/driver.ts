import type {
  CheckoutResult,
  GatewayAdapter,
  Order,
  PaymentErrorCode,
  PaymentMethod,
  PaymentStatus,
  RawCallbackRequest,
  TxnRef,
} from '@nepal-pay/core'

/**
 * A status-disagreement expectation: the callback claims completed but the
 * server-side source of truth disagrees.
 *
 * - `throws`: verification rejects with the given code (eSewa style).
 * - `seals`: verification seals the lower status (Khalti/mock style).
 */
export type DisagreementOutcome =
  | { readonly kind: 'throws'; readonly code: PaymentErrorCode }
  | { readonly kind: 'seals'; readonly status: PaymentStatus }

export interface NativeStatusSample {
  readonly native: string
  readonly unified: PaymentStatus
}

/**
 * Per-gateway plumbing for the shared conformance suite. A driver owns every
 * gateway-specific detail (signed payloads, upstream stubs, ledger state) so
 * `suite.ts` can stay completely gateway-agnostic.
 */
export interface GatewayConformanceDriver {
  readonly name: PaymentMethod

  /** Canonical order used across every case (NPR 230.00). */
  readonly order: Order

  /** A fresh gateway with stubbed upstream behaviour. */
  createGateway(): GatewayAdapter

  /**
   * A gateway whose lookup/status endpoint hangs until aborted and whose
   * timeout is very short — used for the timeout error case.
   */
  hangingGateway(): GatewayAdapter

  /**
   * Creates a checkout for the canonical order AND completes the payment at
   * the gateway so the server-side truth reports completed.
   */
  paidCheckout(gateway: GatewayAdapter): Promise<CheckoutResult>

  /** The redirect callback the gateway sends for the completed payment. */
  completedCallback(
    gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest>

  /** A callback whose amount does not match the order (otherwise valid). */
  tamperedAmount(
    gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest>

  /** A callback whose order id does not match the order (otherwise valid). */
  tamperedOrder(
    gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<RawCallbackRequest>

  /**
   * A callback with a broken signature. Only provided by signed gateways;
   * unsigned gateways (Khalti) leave this undefined by design.
   */
  tamperedSignature?: (
    gateway: GatewayAdapter,
    txnRef: TxnRef
  ) => Promise<RawCallbackRequest>

  /**
   * Flips the server-side truth so it disagrees with a completed callback
   * for the given transaction.
   */
  setUpstreamDisagreement(
    gateway: GatewayAdapter,
    txnRef: TxnRef
  ): Promise<void>

  /** Drives the gateway into a native status state for status() lookups. */
  setStatus(
    gateway: GatewayAdapter,
    txnRef: TxnRef,
    native: string
  ): Promise<void>

  /** A well-formed transaction id the gateway has never seen. */
  readonly unknownTxnRef: TxnRef

  /** What status() does when the transaction cannot be found. */
  readonly unknownTransaction: DisagreementOutcome

  /** What verify() does when the server disagrees with a completed callback. */
  readonly disagreement: DisagreementOutcome

  /** Native status samples exercised through the status() path. */
  readonly statusSamples: ReadonlyArray<NativeStatusSample>

  /**
   * Whose id status() reports when called without an expected order:
   * `'order'` (lookup carries the purchase order id) or `'txnRef'`.
   */
  readonly orderIdWithoutExpected: 'order' | 'txnRef'

  /**
   * Whether status() can recover an amount without an expected order. Defaults
   * to `true`; set `false` for gateways whose lookup requires the amount (e.g.
   * Fonepay's `verificationMerchant`), which disables the corresponding suite
   * case.
   */
  readonly statusWithoutExpected?: boolean
}
