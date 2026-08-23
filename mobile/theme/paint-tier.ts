import { Platform } from 'react-native'
import * as Device from 'expo-device'
import { flattenShadowRecipes } from '@/theme/flatten-box-shadow'

/**
 * Tier de PINTURA para hardware de gama baja — el hermano del gate de
 * animaciones de `reduced-motion-provider.tsx` (mismo umbral, misma
 * razón, misma fuente `Device.deviceYearClass`).
 *
 * El gate de animaciones apaga los loops decorativos; este apaga el
 * COSTO DE PINTADO del vocabulario neumórfico: en GPUs viejas el
 * RenderThread se satura emitiendo draw commands de sombras difuminadas
 * multicapa (medido 2026-08-20 en un moto g20 / Unisoc T700: "Slow
 * issue draw commands" en ~96% de los frames en dev Y en release, p50
 * de frame 40ms — el bottleneck es pintar, no JS). Con el tier plano
 * cada superficie conserva UNA key shadow (blur capado) + sus capas
 * blur-0 de identidad (anillos, líneas de luz). Ver
 * `flatten-box-shadow.ts` para la regla exacta.
 *
 * Se computa UNA vez a nivel módulo (igual que
 * HARDWARE_REQUIRES_REDUCED_MOTION): los specs lo aplican en su init y
 * el costo runtime es cero. En hardware sin clasificar (null) se
 * conserva la pintura completa.
 *
 * SOLO ANDROID (decisión owner 2026-08-21): la 2.0.0 ya está viva en el
 * App Store con la pintura completa QA-da — un iPhone 8/X/XR (year class
 * <2020) entraría al tier y cambiaría de look sin que nadie lo haya
 * mirado. El gate de plataforma mantiene el próximo build de iOS
 * idéntico al shippeado; extenderlo a iPhones viejos es una decisión
 * futura con QA propio. (El gate de ANIMACIONES de reduced-motion-provider
 * sí sigue cross-platform — ese ya estaba en producción.)
 */
export const FLAT_PAINT_TIER =
  Platform.OS === 'android' &&
  Device.deviceYearClass != null &&
  Device.deviceYearClass < 2020

/**
 * Fase 2 del tier — ENCENDIDA (decisión owner 2026-08-20): en gama baja
 * los gradientes se convierten en fills sólidos (todo gradiente del
 * rediseño pasa por el seam `cssGradient()` y ya carga su fallback).
 * Motivo: tras la fase 1 el moto g20 seguía con 53% de frames con draw
 * commands lentos; el shader por vista es el siguiente costo grande.
 * En hardware capaz no cambia nada (el flag compone con
 * FLAT_PAINT_TIER).
 */
export const FLAT_TIER_SOLID_FILLS = true

/**
 * Aplana las recetas de sombra de un objeto de spec/tokens cuando el
 * hardware lo pide; identidad (mismo objeto) en hardware capaz.
 */
export function applyPaintTier<T>(spec: T): T {
  return flattenShadowRecipes(spec, FLAT_PAINT_TIER)
}
