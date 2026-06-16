import { useEffect } from 'react'

/**
 * Instrumentación DEV-ONLY de animaciones/navegación entre vistas.
 *
 * Objetivo: ver en consola qué pasa durante las transiciones de tab para
 * detectar anomalías de LÓGICA (doble-focus, re-mounts inesperados,
 * transiciones que disparan dos veces, CountUpText que resetea a 0) y un
 * resumen de frames por transición para ubicar jank.
 *
 * IMPORTANTE:
 *  - Todo está gateado por `__DEV__` + un flag runtime → cero costo y cero
 *    salida en release. `console.log` cruza el bridge a Metro, así que en
 *    un debug build esto AGREGA algo de jank; sirve para detectar lógica,
 *    no para medir el FPS verdadero (eso se juzga en release con el
 *    Performance Monitor).
 *  - El sampler de frames NO loguea por-frame: junta deltas durante una
 *    ventana corta después de cada focus y emite UN resumen, atado a la
 *    vista. Así el ruido es mínimo y el dato queda ligado a la transición.
 */

let enabled = __DEV__

export function setAnimLogEnabled(value: boolean): void {
  enabled = value && __DEV__
}

export function isAnimLogEnabled(): boolean {
  return enabled
}

function now(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance
  return typeof perf?.now === 'function' ? perf.now() : Date.now()
}

const T0 = now()

function stamp(): string {
  return `${Math.round(now() - T0)}ms`
}

/**
 * Loguea un evento de animación/nav. No-op si está deshabilitado o en
 * release. `scope` agrupa (nav · screen · gate · countup · frames) y
 * `event` es el sub-evento.
 */
export function animLog(
  scope: string,
  event: string,
  data?: Record<string, unknown>,
): void {
  if (!enabled) return
  const head = `[anim ${stamp()}] ${scope}:${event}`
  if (data && Object.keys(data).length > 0) {
    console.log(head, data)
  } else {
    console.log(head)
  }
}

// ─── Sampler de frames por transición ────────────────────────────────

// Un frame a 60fps dura ~16.67ms. Contamos como "caído" cualquier delta
// > 32ms (≥2 frames perdidos). Ventana de muestreo corta tras el focus.
const FRAME_DROP_MS = 32
const SAMPLE_WINDOW_MS = 700

let sampling = false

/**
 * Muestrea los deltas entre frames durante `SAMPLE_WINDOW_MS` después de
 * un focus y emite un resumen (frames, caídos, peor delta). Ignora
 * llamadas solapadas (una ventana a la vez).
 */
export function sampleTransitionFrames(routeName: string): void {
  if (!enabled || sampling) return
  if (typeof requestAnimationFrame !== 'function') return
  sampling = true

  const start = now()
  let last = start
  let frames = 0
  let dropped = 0
  let worst = 0

  const tick = () => {
    const t = now()
    const delta = t - last
    last = t
    frames += 1
    if (delta > FRAME_DROP_MS) {
      dropped += 1
      if (delta > worst) worst = delta
    }
    if (t - start < SAMPLE_WINDOW_MS) {
      requestAnimationFrame(tick)
      return
    }
    sampling = false
    animLog('frames', routeName, {
      frames,
      dropped,
      worstMs: Math.round(worst),
      windowMs: Math.round(t - start),
    })
    if (dropped > 0) {
      console.warn(
        `[anim] ⚠️ ${routeName}: ${dropped} frame(s) caído(s) en la transición (peor ${Math.round(worst)}ms)`,
      )
    }
  }

  requestAnimationFrame(tick)
}

// ─── Compositor de screenListeners para <Tabs> ───────────────────────

type ListenerMap = Record<string, ((e: { target?: string }) => void) | undefined>

function routeNameFromTarget(target?: string): string {
  return (target ?? '').split('-')[0] || 'unknown'
}

// Route actualmente focuseado (null cuando está blurreado). Sirve para
// distinguir un DUP real (focus sobre un route YA focuseado, sin blur en el
// medio) de un re-focus legítimo al volver a un tab tras cerrar un
// modal/stack (ahí hubo blur → quedó null).
let focusedRoute: string | null = null
let lastFocusAt = 0

/**
 * Envuelve los `screenListeners` existentes (haptics) agregando logging
 * dev de focus/blur/tabPress + el sampler de frames en cada focus.
 * Detecta anomalías: focus al MISMO route dos veces sin blur (DUP) y
 * focus en ráfaga (sinceLastMs chico). En release devuelve los listeners
 * sin tocar.
 */
export function withNavDevLog(base: ListenerMap): ListenerMap {
  if (!enabled) return base
  return {
    ...base,
    tabPress: (e) => {
      base.tabPress?.(e)
      animLog('nav', 'tabPress', { route: routeNameFromTarget(e?.target) })
    },
    focus: (e) => {
      base.focus?.(e)
      const route = routeNameFromTarget(e?.target)
      const t = now()
      const sinceLastMs = lastFocusAt ? Math.round(t - lastFocusAt) : null
      // DUP real = focus disparó sobre el route que YA estaba focuseado, sin
      // blur en el medio (doble-transición). Volver a un tab tras cerrar un
      // modal/stack NO es DUP (hubo blur → focusedRoute quedó null).
      const dup = focusedRoute === route
      animLog('nav', 'focus', {
        route,
        sinceLastMs,
        ...(dup ? { DUP: true } : null),
      })
      focusedRoute = route
      lastFocusAt = t
      sampleTransitionFrames(route)
    },
    blur: (e) => {
      base.blur?.(e)
      focusedRoute = null
      animLog('nav', 'blur', { route: routeNameFromTarget(e?.target) })
    },
  }
}

// ─── Ciclo de vida de screens (detección de re-mounts) ───────────────

/**
 * Loguea mount/unmount de un screen. Con `lazy:false` los tabs se montan
 * una vez en boot y NO deberían re-montarse al navegar — un `screen:mount`
 * después del boot es la anomalía a cazar (causa re-fire de entradas).
 */
export function useScreenLifecycleLog(name: string): void {
  useEffect(() => {
    if (!enabled) return
    animLog('screen', 'mount', { name })
    return () => {
      animLog('screen', 'unmount', { name })
    }
  }, [name])
}
