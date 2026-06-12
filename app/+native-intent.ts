/**
 * Intercepta las URLs nativas ANTES de que expo-router intente
 * matchearlas como rutas.
 *
 * expo-share-intent relanza la app vía custom scheme
 * (`manifiesto://dataUrl=manifiestoShareKey`) cuando le compartís una
 * imagen. Esa URL no es una ruta: la consume `useShareIntent()` en el
 * listener del root. Sin este archivo, expo-router mostraba la
 * pantalla "Unmatched route" por encima del flujo (reporte device
 * 2026-06-12) — el share funcionaba igual al volver, pero con esa
 * pantalla parásita en el medio.
 *
 * Patrón oficial de expo-share-intent (example/expo-router). Usamos
 * el marcador `dataUrl=` sin importar la lib para que este archivo
 * sea inerte en Expo Go.
 */
export function redirectSystemPath({
  path,
}: {
  path: string
  initial: boolean
}): string {
  try {
    if (path.includes('dataUrl=')) {
      // Share intent: el listener ya capturó el payload por el hook
      // nativo; el router solo tiene que aterrizar en Home y dejar
      // que el gate (auth ready + datos) abra el wizard.
      return '/'
    }
    return path
  } catch {
    return '/'
  }
}
