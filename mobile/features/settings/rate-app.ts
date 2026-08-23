/**
 * "Calificar Manifiesto" — decide entre el modal nativo de rating
 * (SKStoreReviewController vía expo-store-review) y el deep link al
 * compositor de reseña de App Store.
 *
 * iOS racionea el modal nativo (~3 por año por app, sin señal de si se
 * mostró), así que el flujo es: modal nativo si el sistema lo permite,
 * y si la API no está disponible o falla, el deep link — que SIEMPRE
 * abre la página de reseña. La IO va inyectada para poder testear la
 * política sin mocks de módulos nativos.
 */

export interface RateAppIo {
  /** `StoreReview.isAvailableAsync()` — false en web/simulador viejo. */
  isAvailable: () => Promise<boolean>
  /** `StoreReview.requestReview()` — modal nativo con branding encima. */
  requestReview: () => Promise<void>
  /** `Linking.openURL(STORE_REVIEW_URL)` — fallback garantizado por plataforma. */
  openReviewUrl: () => Promise<unknown>
}

export type RateAppOutcome = 'native-prompt' | 'store-page'

export async function requestAppRating(io: RateAppIo): Promise<RateAppOutcome> {
  try {
    if (await io.isAvailable()) {
      await io.requestReview()
      return 'native-prompt'
    }
  } catch {
    // La API nativa falló (p.ej. binario sin StoreKit) — caemos al
    // deep link. Si ESTE también falla, propaga: el caller muestra
    // el Alert de error (mismo patrón que about-screen).
  }
  await io.openReviewUrl()
  return 'store-page'
}
