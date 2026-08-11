/**
 * Link de iCloud del atajo pre-armado "Manifiesto" (la acción con las
 * variables Cantidad/Comercio ya cableadas). null = todavía no publicado:
 * la pantalla de Ajustes cae al armado manual como camino principal.
 *
 * ⚠️ Un link de iCloud es un snapshot INMUTABLE: si el atajo canónico
 * cambia, hay que compartirlo de nuevo y actualizar esta constante (y eso
 * hoy implica build nueva: el OTA está bloqueado). Mantené el atajo
 * canónico estable.
 */
export const APPLE_PAY_SHORTCUT_ICLOUD_URL: string | null = null
