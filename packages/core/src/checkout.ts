export type CheckoutType = 'redirect' | 'form_post'

export interface Checkout {
  readonly type: CheckoutType
  readonly url: string
  readonly formParams?: Record<string, string>
  readonly headers?: Record<string, string>
}
