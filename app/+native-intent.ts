import { getCurrentPathname } from '@/lib/current-pathname'

/**
 * Intercepta las URLs nativas ANTES de que expo-router intente
 * matchearlas como rutas.
 *
 * expo-share-intent relanza la app vía custom scheme
 * (`manifiesto://dataUrl=manifiestoShareKey`) cuando le compartís una
 * imagen. Esa URL no es una ruta: la consume el listener del root.
 *
 * Dónde redirigir importa MUCHO (root cause del device report
 * 2026-06-12 v3, visto en logs de Metro):
 *  - En COLD (initial=true) devolver `/` es inofensivo — la app está
 *    booteando igual y `/` es su entrada.
 *  - En WARM (initial=false), `/` es la ruta de BOOT: re-corre la
 *    máquina de auth entera (splash + bridge + reveal ≈ 7s — la
 *    "lentitud" reportada), navega a home de nuevo montando una
 *    SEGUNDA instancia del stack (assertion de advisor-host dev-only)
 *    y pisotea el estado del share-host → el wizard nunca aparecía.
 *    El fix: devolver la ruta DONDE EL USUARIO YA ESTÁ (espejada por
 *    <PathnameMirror/>) — navegación no-op, cero re-boot. El share lo
 *    levanta el listener/poll igual; el router no tiene que moverse.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string
  initial: boolean
}): string {
  try {
    if (path.includes('dataUrl=')) {
      if (initial) return '/'
      return getCurrentPathname() ?? '/'
    }
    return path
  } catch {
    return '/'
  }
}
