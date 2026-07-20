// Brot particles — port 1:1 del web component <brot-particles>
// (design/rediseno-2026-07/particles.js) a React Native Skia.
//
//   <BrotParticles colors={['#C9F3C6', '#FBD9BC']} count={14} borderRadius={32} />
//
// Overlay absoluto que llena su contenedor (como el original: position
// absolute + pointer-events none). Partículas con drift vertical lento
// (wrap), vaivén horizontal sinusoidal, twinkle de alpha 0.25–0.8 y un
// halo a 2.6× del radio con 25% del alpha.
//
// Mismo enfoque que brot-mascot.tsx: módulo Skia opcional vía
// getOptionalSkiaModule (fallback = View vacío que preserva layout),
// SkPicture grabado imperativamente dentro de un useDerivedValue, reloj
// por useFrameCallback con fase random por instancia. Cero estado de
// React por frame: el único setState es el onLayout (equivalente al
// ResizeObserver del original) y ocurre solo al medir/redimensionar.
//
// Las coordenadas de cada partícula son normalizadas (0..1) y se escalan
// al tamaño medido en el draw — igual que el original, que tampoco
// regenera partículas al resize. La inicialización random corre UNA vez
// por (count, colors) en el JS thread, nunca por frame.
//
// Perf (gama baja Android como piso) — mismas medidas que brot-mascot.tsx:
// reloj anclado a info.timestamp (re-registrar el callback no rebobina),
// worklet del callback con identidad estable, gate por foco de navegación,
// paint cacheado por instancia, colores parseados UNA vez en el JS thread
// (Skia.Color por partícula, no por frame) y dispose() del picture
// anterior al reemplazarlo.

import { memo, useEffect, useMemo, useState } from 'react'
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import {
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type FrameInfo,
  type SharedValue,
} from 'react-native-reanimated'
import type { ClipOp, PaintStyle, SkColor, SkPicture } from '@shopify/react-native-skia'
import {
  getOptionalSkiaModule,
  useOptionalIsFocused,
  type SkiaModule,
} from '@/lib/optional-skia'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

// ─── API pública ─────────────────────────────────────────────────────

export interface BrotParticlesProps {
  /** Paleta ciclada por índice de partícula (i % colors.length). */
  colors?: readonly string[]
  count?: number
  /**
   * Radio de esquinas para clipear el dibujo (la hero card usa 32).
   * Sin valor no se clipea.
   */
  borderRadius?: number
  /** Overrides del overlay absolute-fill por defecto. */
  style?: StyleProp<ViewStyle>
  /**
   * false = frame estático (las partículas quedan congeladas en su fase
   * inicial; cero trabajo por frame). Gate de Reduce Motion del sistema
   * — los callers pasan !useReducedMotion() (review r1 del cableado).
   */
  animated?: boolean
}

const DEFAULT_COLORS = ['#C9F3C6', '#FBD9BC', '#EFF6E2'] as const

/** Clave por contenido de la paleta ('|' como separador para tolerar
 *  colores rgba(...) con comas). Compartida por el componente y el
 *  comparator del memo: un array inline en el caller no re-randomiza
 *  partículas ni rompe el memo. */
function paletteKeyFor(colors: BrotParticlesProps['colors']): string {
  return (colors !== undefined && colors.length > 0 ? colors : DEFAULT_COLORS).join('|')
}

// ─── Partículas ──────────────────────────────────────────────────────

interface Particle {
  /** Posición normalizada 0..1. */
  x: number
  y: number
  /** Radio en dp (1.2–3.4). */
  r: number
  /** Velocidad vertical en alturas-de-contenedor por segundo (0.006–0.018). */
  s: number
  /** Fase (0–2π) compartida por sway y twinkle. */
  ph: number
  /** Frecuencia de twinkle (0.6–1.8 rad/s). */
  tw: number
  /** Color ya parseado (Skia.Color en el JS thread, UNA vez por partícula
   *  — no parsear el string por partícula por frame en el worklet). */
  skColor: SkColor
}

// ─── Infraestructura Skia ────────────────────────────────────────────

/** Subconjunto worklet-safe del módulo (host object + enums), para no
 *  capturar componentes de React adentro del worklet. */
interface SkiaEnv {
  Skia: SkiaModule['Skia']
  psFill: PaintStyle
  clipIntersect: ClipOp
}

// ─── Componente ──────────────────────────────────────────────────────

function BrotParticlesImpl({
  colors = DEFAULT_COLORS,
  count = 14,
  borderRadius,
  style,
  animated = true,
}: BrotParticlesProps) {
  const skiaModule = getOptionalSkiaModule()

  const skiaEnv = useMemo<SkiaEnv | null>(() => {
    if (!skiaModule) {
      return null
    }
    return {
      Skia: skiaModule.Skia,
      psFill: skiaModule.PaintStyle.Fill,
      clipIntersect: skiaModule.ClipOp.Intersect,
    }
  }, [skiaModule])

  // Paint cacheado por instancia, reusado frame a frame (el canvas de
  // grabación copia el paint al grabar cada comando — mutarlo es seguro).
  const skiaCache = useMemo(() => {
    if (skiaEnv === null) {
      return null
    }
    const fill = skiaEnv.Skia.Paint()
    fill.setAntiAlias(true)
    fill.setStyle(skiaEnv.psFill)
    return { fill }
  }, [skiaEnv])

  // Tamaño medido del contenedor (rol del ResizeObserver del original).
  // Hasta conocer el layout no se dibuja nada, pero se sigue midiendo.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setSize((prev) =>
      prev !== null && prev.width === width && prev.height === height
        ? prev
        : { width, height },
    )
  }

  // Clave por contenido (no por identidad) para que un array inline en el
  // caller no re-randomice las partículas en cada render del padre.
  const paletteKey = paletteKeyFor(colors)

  // Inicialización random UNA vez por (count, paleta), en el JS thread —
  // mismos rangos que el _size() del original. El color se parsea acá
  // (Skia.Color es invocable en el JS thread) para que el worklet reciba
  // el Float32Array ya listo.
  const particles = useMemo<Particle[]>(() => {
    const palette = paletteKey.split('|')
    const n = Math.max(0, Math.floor(count))
    return Array.from({ length: n }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 1.2 + Math.random() * 2.2,
      s: 0.006 + Math.random() * 0.012,
      ph: Math.random() * 6.28,
      tw: 0.6 + Math.random() * 1.2,
      // Sin Skia el componente rinde el fallback y esto nunca se usa.
      skColor:
        skiaEnv === null ? new Float32Array(4) : skiaEnv.Skia.Color(palette[i % palette.length]),
    }))
  }, [count, paletteKey, skiaEnv])

  // Fase random por instancia (como this._t0 del original) para que
  // varios overlays no parpadeen sincronizados.
  const phase = useMemo(() => Math.random() * 10, [])

  // Reloj en segundos (t = "segundos desde el mount" + phase) en el UI
  // thread. Anclado a info.timestamp con el primer timestamp persistido en
  // un shared value: re-registrar el frame callback (que resetea
  // timeSinceFirstFrame a 0) no rebobina la animación. El worklet tiene
  // identidad estable (useMemo) para no re-registrarse por render.
  const clock = useSharedValue(phase)
  const clockStart = useSharedValue(-1)
  const onFrame = useMemo(
    () => (info: FrameInfo) => {
      'worklet'
      if (clockStart.value < 0) {
        clockStart.value = info.timestamp
      }
      clock.value = (info.timestamp - clockStart.value) / 1000 + phase
    },
    [clock, clockStart, phase],
  )
  const frameCallback = useFrameCallback(onFrame, false)

  const measured = size !== null && size.width > 0 && size.height > 0

  // Gate por foco: pantallas de stack tapadas quedan montadas; sin esto el
  // overlay seguiría grabando SkPictures a 60fps invisible. Con el reloj
  // por timestamp, al recuperar foco t salta como si nunca hubiera parado.
  const isFocused = useOptionalIsFocused()
  // Reduce Motion del sistema + hardware débil (deviceYearClass): frame
  // estático, cero trabajo por frame (mismo gate que BrotMascot).
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    if (skiaEnv === null || !measured || !isFocused || !animated || reducedMotion) {
      return
    }
    frameCallback.setActive(true)
    return () => {
      frameCallback.setActive(false)
    }
  }, [frameCallback, skiaEnv, measured, isFocused, animated, reducedMotion])

  const width = size?.width ?? 0
  const height = size?.height ?? 0

  // Un SkPicture nuevo por frame, grabado en el UI thread (cero commits
  // de Fabric por frame). Física idéntica al _draw() del original. OJO:
  // este worklet no debe escribir shared values capturados — serían inputs
  // del mapper y cada escritura lo re-dispararía (por eso el dispose vive
  // en la reaction de abajo y el paint se cachea en el JS thread).
  const picture = useDerivedValue<SkPicture | null>(() => {
    const env = skiaEnv
    const cache = skiaCache
    if (env === null || cache === null) {
      return null
    }
    // Sin layout todavía: picture VACÍO, nunca null. El <Picture> puede
    // montarse un mapper-tick antes de que este worklet recompute con el
    // tamaño real, y el drawPicture de sksg no tolera null (crash race
    // del primer render, más probable en Android lento).
    const t = clock.value
    const { Skia } = env
    const recorder = Skia.PictureRecorder()
    const canvas = recorder.beginRecording(
      Skia.XYWHRect(0, 0, Math.max(width, 1), Math.max(height, 1)),
    )
    if (width > 0 && height > 0) {
      if (borderRadius !== undefined && borderRadius > 0) {
        canvas.clipRRect(
          Skia.RRectXY(Skia.XYWHRect(0, 0, width, height), borderRadius, borderRadius),
          env.clipIntersect,
          true,
        )
      }
      const fill = cache.fill
      for (const p of particles) {
        const y = (((p.y - t * p.s) % 1) + 1) % 1
        const x = p.x + Math.sin(t * 0.5 + p.ph) * 0.02
        const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * p.tw + p.ph))
        fill.setColor(p.skColor)
        // núcleo
        fill.setAlphaf(a)
        canvas.drawCircle(x * width, y * height, p.r, fill)
        // halo
        fill.setAlphaf(a * 0.25)
        canvas.drawCircle(x * width, y * height, p.r * 2.6, fill)
      }
    }
    const result = recorder.finishRecordingAsPicture()
    recorder.dispose()
    return result
  })

  // Libera el picture anterior al reemplazarlo (misma nota que en
  // brot-mascot.tsx: en rn-skia 2.2.12 dispose() es no-op en native, pero
  // deja el ownership explícito y libera en web/futuras versiones).
  useAnimatedReaction(
    () => picture.value,
    (current, previous) => {
      if (previous !== null && previous !== current) {
        previous.dispose()
      }
    },
  )

  if (!skiaModule || skiaEnv === null) {
    // Sin Skia (web / test env): overlay vacío que preserva el layout.
    return <View pointerEvents="none" style={[styles.overlay, style]} />
  }

  const { Canvas, Picture } = skiaModule
  return (
    <View pointerEvents="none" style={[styles.overlay, style]} onLayout={onLayout}>
      {measured ? (
        <Canvas style={{ width, height }}>
          {/* El worklet devuelve null SOLO sin skiaEnv (y en ese caso
              rendereamos el fallback de arriba); sin tamaño produce un
              picture vacío — el cast es seguro. */}
          <Picture picture={picture as SharedValue<SkPicture>} />
        </Canvas>
      ) : null}
    </View>
  )
}

/** Comparator del memo: `colors` se compara por CONTENIDO (join '|'), así
 *  un array inline en el caller no rompe el memo. `style` se compara por
 *  identidad — pasar un style estable (StyleSheet / módulo), no inline. */
function arePropsEqual(prev: BrotParticlesProps, next: BrotParticlesProps): boolean {
  return (
    prev.count === next.count &&
    prev.borderRadius === next.borderRadius &&
    prev.style === next.style &&
    (prev.animated ?? true) === (next.animated ?? true) &&
    paletteKeyFor(prev.colors) === paletteKeyFor(next.colors)
  )
}

export const BrotParticles = memo(BrotParticlesImpl, arePropsEqual)

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
})
