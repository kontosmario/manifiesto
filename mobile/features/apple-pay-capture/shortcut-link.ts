/**
 * Link de iCloud del atajo pre-armado "Manifiesto" (la acción con las
 * variables Cantidad/Comercio ya cableadas). null = todavía no publicado:
 * la pantalla de Ajustes cae al armado manual como camino principal.
 *
 * ⚠️ Un link de iCloud es un snapshot INMUTABLE: si el atajo canónico
 * cambia, hay que compartirlo de nuevo y actualizar esta constante (y eso
 * hoy implica build nueva: el OTA está bloqueado). Mantené el atajo
 * canónico estable.
 *
 * Link vigente (verificado 2026-08-11 bajando el plist del link y
 * chequeando: input class WFWalletTransactionContentItem, una sola acción
 * —ManifiestoLogExpenseIntent— y amount→"Amount" / merchant→"Merchant"
 * como propiedades de la Entrada del atajo). El runbook de regeneración y
 * re-verificación vive en docs/sistemas/apple-pay-captura.md.
 */
export const APPLE_PAY_SHORTCUT_ICLOUD_URL: string | null =
  'https://www.icloud.com/shortcuts/fdbe864ed53e42fb9b0e0cb3321e367c'
