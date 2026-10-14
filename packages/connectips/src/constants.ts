/** Transaction id (TXNID) charset accepted by connectIPS. */
export const TXNID_PATTERN = /^[A-Za-z0-9_-]+$/

/** NCHL caps TXNID at 20 characters. */
export const TXNID_MAX_LENGTH = 20

/** NCHL caps REFERENCEID at 20 characters. */
export const REFERENCEID_MAX_LENGTH = 20

export const REMARKS_MAX_LENGTH = 50

export const PARTICULARS_MAX_LENGTH = 100

export const CONNECTIPS_CURRENCY = 'NPR'

/**
 * Field order used to build the checkout token message. NCHL specifies an
 * exact comma-separated string, terminated by the literal `TOKEN=TOKEN`.
 */
export const CHECKOUT_TOKEN_FIELDS = [
  'MERCHANTID',
  'APPID',
  'APPNAME',
  'TXNID',
  'TXNDATE',
  'TXNCRNCY',
  'TXNAMT',
  'REFERENCEID',
  'REMARKS',
  'PARTICULARS',
] as const

/**
 * `creditStatus` values from `gettxndetail` that denote a settled credit.
 * Anything else (e.g. `888`) is treated as a failed credit.
 */
export const SUCCESS_CREDIT_STATUSES = ['000', '999', 'DEFER'] as const
