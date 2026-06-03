export interface Frame {
  top: number
  left: number
  width: number
  height: number
}

export interface Line {
  text: string
  frame: Frame
}

export interface TransactionGroup {
  lines: Line[]
  top: number
}

export type Sign = 1 | -1

export interface Amount {
  value: number
  currency: string
  sign: Sign
}

export interface Transaction {
  merchant: string
  date: string | null
  section: string | null
  primaryAmount: Amount
  secondaryAmount: Amount | null
  raw: string
}

export interface ParseResult {
  transactions: Transaction[]
  unmatched: TransactionGroup[]
}
