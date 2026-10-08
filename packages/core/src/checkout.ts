export type CheckoutType = 'redirect' | 'form_post'

export type Checkout =
  | {
      readonly type: 'redirect'
      readonly url: string
      readonly headers?: Record<string, string>
    }
  | {
      readonly type: 'form_post'
      readonly url: string
      readonly formParams?: Record<string, string>
      readonly headers?: Record<string, string>
    }
