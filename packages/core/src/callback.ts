export interface RawCallbackRequest {
  readonly body?: Record<string, unknown>
  readonly query?: Record<string, unknown>
  readonly headers?: Record<string, string>
}

export interface UnverifiedCallback {
  readonly gateway: string
  readonly data: Record<string, unknown>
  readonly headers?: Record<string, string>
}
