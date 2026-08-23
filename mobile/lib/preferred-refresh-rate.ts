import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { FLAT_PAINT_TIER } from '@/theme/paint-tier'

interface PreferredRefreshRateNativeModule {
  setPreferredRefreshRate: (rate: number) => Promise<void>
}

// `requireOptionalNativeModule` devuelve null cuando el módulo no está
// (iOS, web, Expo Go, builds anteriores a esta feature) — mismo patrón
// que apple-pay-capture/native.ts.
const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<PreferredRefreshRateNativeModule>('PreferredRefreshRate')
    : null

/**
 * En hardware del tier de pintura de gama baja, prefiere 60Hz para la
 * ventana de la app: paneles forzados a 90/120Hz imponen un presupuesto
 * por frame que ese SoC no puede cumplir (ver paint-tier.ts). Es un hint
 * por-app — no toca la configuración del usuario ni a otras apps — y en
 * hardware capaz no hace nada.
 */
export function applyLowTierRefreshRate(): void {
  if (!FLAT_PAINT_TIER || native == null) return
  void native.setPreferredRefreshRate(60).catch(() => {
    // Best-effort: si el OEM rechaza el hint, la app sigue igual.
  })
}
