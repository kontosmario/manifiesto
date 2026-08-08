export interface PendingCapture {
  id: string
  merchantRaw: string
  amountRaw: string
  /** ISO-8601 estampado por el intent nativo al momento del pago. */
  capturedAt: string
}
