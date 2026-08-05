import { useRef, useEffect } from 'react'
import { PixelRatio, Platform, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations, motionEasings } from '@/lib/motion/tokens'
import { useAppTheme } from '@/theme/theme-provider'
import { withAlpha } from '@/theme/color-utils'

/**
 * SCROLL EDGE EFFECT — la franja del safe area superior (status bar /
 * isla dinámica) deja de ser una banda opaca y pasa a ser un material
 * translúcido que SOLO aparece cuando hay contenido pasando por debajo.
 *
 * Es el patrón `scrollEdgeAppearance` de UIKit (iOS 26 lo renombró
 * "scroll edge effect" dentro de Liquid Glass), y el mismo que usan
 * Instagram/Apple: arriba del todo el chrome es invisible; al scrollear
 * el material difumina lo que pasa por detrás para que la hora y los
 * íconos del sistema no se mezclen con el contenido.
 *
 * ── POR QUÉ SE APILAN CAPAS ────────────────────────────────────────
 * `expo-blur` NO expone máscara de opacidad (la superficie entera es
 * `tint` + `intensity`), y `@react-native-masked-view/masked-view` no
 * está instalado. Sin máscara, un blur que se desvanece hacia abajo
 * solo se puede aproximar APILANDO capas de alturas decrecientes: cada
 * capa suma desenfoque sobre las de abajo, así que el material
 * ACUMULADO decrece a medida que se va cortando cada capa.
 *
 * ── POR QUÉ SE VEÍAN ESCALINATAS (y qué las mata) ───────────────────
 * El borde inferior de cada capa es un corte DURO: el nativo hace
 * `clipsToBounds = true`, no hay ni un píxel de plumeado. En ese borde
 * el material acumulado cae de golpe en la intensidad de esa capa, y
 * una discontinuidad de alfa sobre una línea recta que cruza todo el
 * ancho es el caso óptimo para banda de Mach (el ojo exagera el
 * escalón). Con la tabla vieja —4 capas de intensidad 5/7/9/12— el
 * peor borde tiraba 12 unidades de golpe sobre un acumulado de 33: un
 * 36% del material en 0px. Eso son las 4 líneas que reportó el owner.
 *
 * Lo que mata el escalón NO es "más blur" ni "menos blur": es que la
 * INTENSIDAD DE CADA CAPA sea chica, porque el salto visible en el
 * borde de una capa ES exactamente su intensidad. Tres decisiones:
 *
 * 1. CURVA OBJETIVO en vez de números a ojo. Se fija el perfil del
 *    material acumulado C(u) = K·(1-u)^p (u = y/fadeHeight) y la
 *    intensidad de cada capa sale como la DERIVADA DISCRETA de ese
 *    perfil: cada capa aporta solo el tramo de curva que hay entre su
 *    borde y el de la capa inmediatamente más corta. Con p = 2 la
 *    curva llega a 0 con pendiente 0, así que la capa que muere al pie
 *    de la franja —la única cuyo borde cae donde el velo ya no atenúa
 *    nada— hereda una intensidad ~0 (se pisa en `MIN_INTENSITY` solo
 *    para no salir del rango documentado de expo-blur).
 * 2. MÁS CAPAS: el escalón máximo escala ~K/N, así que pasar de 4 a 7
 *    lo baja de 12 a ~5.7 unidades. El techo son ~8: duplicar N solo
 *    divide el escalón por 2 y duplica los pases de backdrop, que se
 *    SERIALIZAN (cada capa samplea el resultado de las de abajo).
 * 3. ORDEN DE PINTADO INVERTIDO (gratis). Un `UIVisualEffectView`
 *    difumina lo que se pintó ANTES que él dentro de sus bounds. Con
 *    la tabla vieja la capa completa pintaba primera y la más corta
 *    última, así que ningún borde recibía desenfoque de nadie y los 4
 *    quedaban nítidos. Pintando de la MÁS CORTA a la MÁS ALTA, cada
 *    borde lo suavizan todas las capas más altas que él —que son, por
 *    construcción, el material acumulado en ese punto— y el corte se
 *    reparte en unos pocos pt de rampa. Por eso `EDGE_BLUR_LAYERS`
 *    está ordenada ASCENDENTE por altura y se mapea en ese orden:
 *    reordenarla cambia el resultado visual.
 *
 * Efectos laterales asumidos: el radio de blur compone en CUADRATURA
 * (√Σσ²) mientras el tinte compone casi lineal, así que repartir el
 * mismo presupuesto en 7 capas baja el desenfoque arriba ~30% — va en
 * la dirección pedida ("que se distinga el contenido de atrás"). La
 * cobertura total NO sube: Π(1-k) da ~27% contra ~29% de la tabla
 * vieja, o sea queda un poco MÁS transparente.
 *
 * El tint es el material más fino de Apple
 * (`systemUltraThinMaterial`): máximo radio por unidad de alfa.
 *
 * Android mantiene el gradiente (el blur real exige
 * `experimentalBlurMethod` con coste GPU no justificado en gama media,
 * mismo trade-off que `TabBarBackground`), que además ya desvanece
 * hacia abajo por definición y por lo tanto no tiene escalones.
 *
 * `pointerEvents="none"`: es decoración, nunca intercepta toques.
 */

/** Scroll (px) a partir del cual el material aparece. Un umbral chico
 *  para que acompañe al primer gesto, pero > 0 para que el rebote
 *  elástico de iOS en el tope no lo haga parpadear. */
export const SCROLL_EDGE_THRESHOLD = 6

/** Una capa del degradé: alto relativo a la franja + intensidad de blur. */
export interface EdgeLayer {
  /** Alto de la capa como fracción de la franja (0-1). */
  heightRatio: number
  /** `intensity` de expo-blur — ES el salto de material en su borde. */
  intensity: number
}

/** Velo tonal: alfas del color de fondo en posiciones normalizadas. */
export interface EdgeVeil {
  /** Alfa del color de fondo en cada stop. */
  alphas: readonly number[]
  /** Posición de cada stop (0 = tope de la franja, 1 = pie). */
  locations: readonly number[]
}

/** Parámetros de la curva. Son los KNOBS del tuning en device. */
export interface EdgeCurve {
  /** Cantidad de capas (N). El escalón máximo escala ~density/count. */
  count: number
  /** Material acumulado arriba del todo (K). Sube densidad y escalón. */
  density: number
  /** Exponente del decaimiento (p). Más alto = muere más rápido. */
  falloff: number
}

/**
 * Curva de producción. Validada por el owner en device sobre el banco
 * de pruebas (`app/(app)/settings/dev/edge-effect.tsx`), que recalcula
 * esta misma fórmula en vivo con steppers.
 */
export const EDGE_CURVE: EdgeCurve = { count: 7, density: 30, falloff: 2 }

/** Alfa del velo tonal arriba del todo (legibilidad de la hora). */
const VEIL_TOP_ALPHA = 0.55

/**
 * Piso de intensidad. expo-blur documenta el rango 1-100; hoy valores
 * menores pasan igual porque el `@Clamping` de `BlurEffectView` solo
 * clampea en la init, pero es un accidente de implementación que puede
 * desaparecer en cualquier bump de expo.
 */
const MIN_INTENSITY = 1.5

/**
 * Crecimiento del espaciado entre bordes. > 1 DENSIFICA hacia arriba,
 * que es donde la curva cae más rápido y donde por lo tanto los
 * escalones serían más grandes si el espaciado fuera uniforme.
 */
const SPACING_GROWTH = 1.25

function falloffAt(u: number, exponent: number) {
  return Math.pow(Math.max(0, 1 - u), exponent)
}

function roundTo(value: number, decimals: number) {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

/** Bordes inferiores de cada capa (ascendente, el último siempre 1). */
function buildLayerRatios(count: number): number[] {
  const widths: number[] = []
  let width = 1
  for (let index = 0; index < count; index += 1) {
    widths.push(width)
    width *= SPACING_GROWTH
  }
  const total = widths.reduce((sum, value) => sum + value, 0)
  const ratios: number[] = []
  let accumulated = 0
  for (const bandWidth of widths) {
    accumulated += bandWidth
    ratios.push(accumulated / total)
  }
  return ratios
}

/** Punto medio de cada banda — donde se evalúa el perfil objetivo. */
function buildBandMidpoints(ratios: readonly number[]): number[] {
  return ratios.map((ratio, index) => ((index === 0 ? 0 : ratios[index - 1]) + ratio) / 2)
}

/**
 * Resuelve la tabla de capas desde la curva. La intensidad de la capa
 * j es C(banda j-1) − C(banda j): el tramo de perfil que esa capa
 * tiene que cubrir. Devuelve las capas ORDENADAS DE LA MÁS CORTA A LA
 * MÁS ALTA, que es el orden en el que hay que pintarlas (ver docblock).
 */
export function buildEdgeLayers({ count, density, falloff }: EdgeCurve): EdgeLayer[] {
  const ratios = buildLayerRatios(count)
  const midpoints = buildBandMidpoints(ratios)
  // Normalizado contra la primera banda para que el acumulado arriba
  // del todo dé exactamente `density` sin importar N ni p.
  const head = falloffAt(midpoints[0], falloff)
  const accumulated = midpoints.map((mid) => (density * falloffAt(mid, falloff)) / head)
  return ratios.map((heightRatio, index) => {
    const raw =
      index === count - 1 ? accumulated[index] : accumulated[index] - accumulated[index + 1]
    return { heightRatio, intensity: Math.max(MIN_INTENSITY, roundTo(raw, 2)) }
  })
}

/**
 * Velo tonal derivado de LA MISMA curva (mismo p): velo y blur decaen
 * con la misma ley, así que el conjunto se lee como un solo material y
 * no como dos rampas superpuestas.
 *
 * Los stops se colocan en los PUNTOS MEDIOS de las bandas, que son por
 * construcción los puntos más lejanos de todo borde de blur. Importa:
 * un gradiente de N stops es lineal a trozos, o sea tiene una
 * DISCONTINUIDAD DE PENDIENTE en cada stop (su propia banda de Mach) —
 * y el velo viejo tenía su stop en 0.55 a 0.8pt del borde de la capa
 * 0.54, sumando las dos discontinuidades en la misma línea. Esa era la
 * más fea de la captura del owner.
 */
export function buildEdgeVeil(curve: EdgeCurve): EdgeVeil {
  const midpoints = buildBandMidpoints(buildLayerRatios(curve.count))
  const locations = [0, ...midpoints, 1]
  const alphas = [
    VEIL_TOP_ALPHA,
    ...midpoints.map((mid) => roundTo(VEIL_TOP_ALPHA * falloffAt(mid, curve.falloff), 3)),
    0,
  ]
  return { alphas, locations }
}

/** Tabla de producción (iOS). ASCENDENTE = orden de pintado. */
export const EDGE_BLUR_LAYERS: readonly EdgeLayer[] = buildEdgeLayers(EDGE_CURVE)

/** Velo de producción (iOS). */
export const EDGE_VEIL: EdgeVeil = buildEdgeVeil(EDGE_CURVE)

/**
 * Tabla ANTERIOR (4 capas, orden de pintado alto→bajo) y su velo.
 * Se exportan solo para que el banco de pruebas pueda mostrar el A/B
 * contra lo que el owner vio en las capturas. No usar en producción.
 */
export const LEGACY_BLUR_LAYERS: readonly EdgeLayer[] = [
  { heightRatio: 1, intensity: 5 },
  { heightRatio: 0.78, intensity: 7 },
  { heightRatio: 0.54, intensity: 9 },
  { heightRatio: 0.3, intensity: 12 },
]

export const LEGACY_VEIL: EdgeVeil = { alphas: [0.55, 0.18, 0], locations: [0, 0.55, 1] }

/**
 * Velo de Android. Allá el gradiente ES el material (no hay BlurView),
 * así que se mantiene tal cual estaba: el defecto reportado es de
 * iPhone y cambiarle la densidad a Android sería un cambio de look que
 * no se puede validar en la misma sesión.
 */
const ANDROID_VEIL: EdgeVeil = { alphas: [0.96, 0.62, 0], locations: [0, 0.55, 1] }

/** `LinearGradient` exige tuplas de 2+; las listas de la curva son dinámicas. */
function toGradientColors(
  backgroundColor: string,
  alphas: readonly number[],
): readonly [string, string, ...string[]] {
  const [first = 0, second = 0, ...rest] = alphas
  return [
    withAlpha(backgroundColor, first),
    withAlpha(backgroundColor, second),
    ...rest.map((alpha) => withAlpha(backgroundColor, alpha)),
  ]
}

function toGradientLocations(
  locations: readonly number[],
): readonly [number, number, ...number[]] {
  const [first = 0, second = 1, ...rest] = locations
  return [first, second, ...rest]
}

interface ScreenEdgeEffectProps {
  /** Alto de la franja = inset superior del dispositivo. */
  height: number
  /** true = hay contenido por debajo (el usuario scrolleó). */
  active: boolean
  /** Fondo de la pantalla — base del gradiente en Android. */
  backgroundColor: string
  /**
   * Solo para el banco de pruebas: tabla alternativa, ASCENDENTE por
   * altura (el orden del array ES el orden de pintado). `[]` apaga el
   * blur para aislar el velo.
   */
  layers?: readonly EdgeLayer[]
  /**
   * Solo para el banco de pruebas: velo alternativo. `null` lo apaga
   * para aislar el blur.
   */
  veil?: EdgeVeil | null
}

export function ScreenEdgeEffect({
  height,
  active,
  backgroundColor,
  layers,
  veil,
}: ScreenEdgeEffectProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(active ? 1 : 0)
  // Latch monótono: las 4 tabs están pre-montadas (lazy:false), así que
  // sin esto habría 4 × N UIVisualEffectView vivos apenas abre la app,
  // incluyendo los de pantallas que el usuario nunca scrolleó. Con
  // `active=false` el contenedor está en opacity 0 y no se pide draw,
  // pero las capas de backdrop existen igual. Se latchea en el render
  // (no en un efecto) para que el subárbol monte en el MISMO commit en
  // el que arranca el fade — si montara un frame después habría pop.
  const hasBeenActive = useRef(active)
  if (active) hasBeenActive.current = true

  useEffect(() => {
    const target = active ? 1 : 0
    progress.value = reduceMotion
      ? target
      : withTiming(target, {
          duration: motionDurations.standard,
          easing: motionEasings.standard,
        })
  }, [active, progress, reduceMotion])

  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }))

  // Sin inset (Android sin barra traslúcida, web) no hay franja que
  // materializar: no montamos nada.
  if (height <= 0) return null

  // El degradé se extiende un poco MÁS ABAJO del inset para que la capa
  // más suave muera fuera de la zona de la hora — si terminara justo en
  // el inset, el propio final de la capa volvería a leerse como borde.
  const fadeHeight = Math.round(height * 1.35)
  const blurLayers = layers ?? EDGE_BLUR_LAYERS
  const resolvedVeil =
    veil === undefined ? (Platform.OS === 'ios' ? EDGE_VEIL : ANDROID_VEIL) : veil

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { height: fadeHeight }, animatedStyle]}
    >
      {Platform.OS === 'ios' && hasBeenActive.current
        ? blurLayers.map((layer) => (
            <BlurView
              intensity={layer.intensity}
              key={layer.heightRatio}
              style={[
                styles.layer,
                // Redondeo a la grilla de píxeles: con alturas
                // fraccionarias el recorte queda antialiaseado y deja
                // su propia costura de 1px, que es justo lo que
                // estamos tratando de eliminar.
                { height: PixelRatio.roundToNearestPixel(fadeHeight * layer.heightRatio) },
              ]}
              tint={theme.isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
            />
          ))
        : null}
      {/* Velo tonal del color de fondo, desvaneciendo hacia abajo sobre
          la misma curva que el blur: en iOS refuerza la legibilidad de
          la hora sobre contenido claro sin tapar lo de atrás; en
          Android ES el material (sin blur real). */}
      {resolvedVeil ? (
        <LinearGradient
          colors={toGradientColors(backgroundColor, resolvedVeil.alphas)}
          locations={toGradientLocations(resolvedVeil.locations)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    // Sobre el contenido scrolleable, debajo de sheets/modales (que
    // montan en su propio host por encima del árbol del Screen).
    zIndex: 10,
  },
  layer: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
})
