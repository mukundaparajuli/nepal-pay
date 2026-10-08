import {
  PaymentError,
  moneyFromDecimal,
  moneyToDecimal,
  subtractMoney,
  type Checkout,
  type Money,
  type Order,
} from '@nepal-payments/core'
import type { ResolvedEsewaConfig, EsewaCheckoutOptions } from './types.js'
import { signFields } from './signing.js'
import {
  CHECKOUT_SIGNED_FIELD_NAMES,
  TRANSACTION_UUID_PATTERN,
} from './constants.js'

export interface EsewaFormParams {
  readonly amount: string
  readonly tax_amount: string
  readonly product_service_charge: string
  readonly product_delivery_charge: string
  readonly total_amount: string
  readonly transaction_uuid: string
  readonly product_code: string
  readonly success_url: string
  readonly failure_url: string
  readonly signed_field_names: string
  readonly signature: string
}

export interface EsewaCheckout {
  readonly checkout: Checkout
  readonly transactionUuid: string
}

function resolveMoney(value: Money | string | undefined): Money {
  if (value === undefined) return moneyFromDecimal('0')
  return typeof value === 'string' ? moneyFromDecimal(value) : value
}

export async function buildEsewaCheckout(
  config: ResolvedEsewaConfig,
  order: Order,
  options?: EsewaCheckoutOptions
): Promise<EsewaCheckout> {
  const transactionUuid = order.id
  if (!TRANSACTION_UUID_PATTERN.test(transactionUuid)) {
    throw new PaymentError(
      `eSewa transaction_uuid must be alphanumeric or hyphens: ${transactionUuid}`,
      'INVALID_ORDER_ID'
    )
  }

  const successUrl = options?.successUrl ?? config.successUrl ?? order.returnUrl
  const failureUrl =
    options?.failureUrl ?? config.failureUrl ?? order.failureUrl
  if (successUrl === undefined) {
    throw new PaymentError(
      'eSewa checkout requires a success_url (config.successUrl or order.returnUrl)',
      'INVALID_URL'
    )
  }
  if (failureUrl === undefined) {
    throw new PaymentError(
      'eSewa checkout requires a failure_url (config.failureUrl or order.failureUrl)',
      'INVALID_URL'
    )
  }
  for (const [name, url] of [
    ['success_url', successUrl],
    ['failure_url', failureUrl],
  ] as const) {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error()
      }
    } catch {
      throw new PaymentError(
        `Invalid eSewa ${name}: ${String(url)}`,
        'INVALID_URL'
      )
    }
  }

  const total = order.amount
  const tax = resolveMoney(options?.surcharges?.tax)
  const serviceCharge = resolveMoney(options?.surcharges?.serviceCharge)
  const deliveryCharge = resolveMoney(options?.surcharges?.deliveryCharge)
  let amount = total
  for (const [name, surcharge] of [
    ['tax', tax],
    ['serviceCharge', serviceCharge],
    ['deliveryCharge', deliveryCharge],
  ] as const) {
    if (surcharge.currency !== 'NPR' || surcharge.precision !== 2) {
      throw new PaymentError(
        `eSewa ${name} must use NPR with 2 decimal places`,
        'INVALID_AMOUNT'
      )
    }
    amount = subtractMoney(amount, surcharge)
  }
  if (amount.amount < 0n) {
    throw new PaymentError(
      'eSewa surcharges cannot exceed the order amount',
      'INVALID_AMOUNT'
    )
  }

  const totalAmount = moneyToDecimal(total)
  const amountValue = moneyToDecimal(amount)
  const signedValues = {
    total_amount: totalAmount,
    transaction_uuid: transactionUuid,
    product_code: config.merchantCode,
  }
  const signature = await signFields(
    signedValues,
    CHECKOUT_SIGNED_FIELD_NAMES,
    config.secret
  )

  return {
    transactionUuid,
    checkout: {
      type: 'form_post' as const,
      url: config.checkoutFormUrl,
      formParams: {
        amount: amountValue,
        tax_amount: moneyToDecimal(tax),
        product_service_charge: moneyToDecimal(serviceCharge),
        product_delivery_charge: moneyToDecimal(deliveryCharge),
        total_amount: totalAmount,
        transaction_uuid: transactionUuid,
        product_code: config.merchantCode,
        success_url: successUrl,
        failure_url: failureUrl,
        signed_field_names: CHECKOUT_SIGNED_FIELD_NAMES,
        signature,
      },
    },
  }
}
