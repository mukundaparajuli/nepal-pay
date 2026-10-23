import {
  PaymentError,
  type Checkout,
  type Order,
  type RsaPrivateKey,
  type TxnRef,
} from '@nepal-pay/core'
import {
  PARTICULARS_MAX_LENGTH,
  REMARKS_MAX_LENGTH,
  CONNECTIPS_CURRENCY,
} from './constants.js'
import type {
  ConnectIpsCheckoutOptions,
  ResolvedConnectIpsConfig,
} from './types.js'
import { connectIpsPaisaFromMoney } from './money.js'
import { buildCheckoutTokenMessage, signConnectIpsToken } from './signing.js'
import { formatConnectIpsDate, isValidTxnId } from './validation.js'

export interface ConnectIpsFormParams {
  readonly [key: string]: string
  readonly MERCHANTID: string
  readonly APPID: string
  readonly APPNAME: string
  readonly TXNID: string
  readonly TXNDATE: string
  readonly TXNCRNCY: string
  readonly TXNAMT: string
  readonly REFERENCEID: string
  readonly REMARKS: string
  readonly PARTICULARS: string
  readonly TOKEN: string
}

export interface ConnectIpsCheckout {
  readonly checkout: Checkout
  readonly txnRef: TxnRef
}

function resolveField(
  supplied: string | undefined,
  fallback: string | undefined,
  defaultValue: string,
  maxLength: number,
  label: string
): string {
  const value = supplied ?? fallback ?? defaultValue
  if (value.length === 0) {
    throw new PaymentError(`connectIPS ${label} is empty`, 'INVALID_ORDER')
  }
  if (value.length > maxLength) {
    throw new PaymentError(
      `connectIPS ${label} exceeds ${maxLength} characters`,
      'INVALID_ORDER'
    )
  }
  return value
}

export async function buildConnectIpsCheckout(
  config: ResolvedConnectIpsConfig,
  key: RsaPrivateKey,
  order: Order,
  options?: ConnectIpsCheckoutOptions
): Promise<ConnectIpsCheckout> {
  const txnId = order.id
  if (!isValidTxnId(txnId)) {
    throw new PaymentError(
      'connectIPS order id must be 1-20 characters of A-Z, a-z, 0-9, "_" or "-"',
      'INVALID_ORDER_ID'
    )
  }

  const txnAmt = connectIpsPaisaFromMoney(order.amount)
  const txnDate = formatConnectIpsDate(config.now())
  const remarks = resolveField(
    options?.remarks,
    config.remarks,
    order.description ?? 'Payment',
    REMARKS_MAX_LENGTH,
    'REMARKS'
  )
  const particulars = resolveField(
    options?.particulars,
    config.particulars,
    order.productName ?? txnId,
    PARTICULARS_MAX_LENGTH,
    'PARTICULARS'
  )

  const values = {
    MERCHANTID: config.merchantId,
    APPID: config.appId,
    APPNAME: config.appName,
    TXNID: txnId,
    TXNDATE: txnDate,
    TXNCRNCY: CONNECTIPS_CURRENCY,
    TXNAMT: txnAmt,
    REFERENCEID: txnId,
    REMARKS: remarks,
    PARTICULARS: particulars,
  }
  const token = await signConnectIpsToken(
    buildCheckoutTokenMessage(values),
    key
  )

  const formParams: ConnectIpsFormParams = { ...values, TOKEN: token }
  return {
    txnRef: { id: txnId, gateway: 'connectips' },
    checkout: {
      type: 'form_post' as const,
      url: config.loginUrl,
      formParams,
    },
  }
}
