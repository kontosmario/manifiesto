import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import type { HeroState } from './hero-states'

const SCENE_DURATION_MS = 5000
const SCENE_TRANSITION_MS = 360
const EXPO_OUT = Easing.bezier(0.16, 1, 0.3, 1)

interface ManifiestoHeroLiveProps {
  state: HeroState
}

/**
 * Variant C · Manifiesto Diario — mini-Wrapped en el hero.
 *
 * Gramática completa portada del CycleWrappedModal:
 *   · 3 progress bars top (Wrapped grammar)
 *   · brand mark "MANIFIESTO · MES"
 *   · 1 sentencia por página
 *   · auto-advance 5s linear
 *   · tap left/right navega manual + haptic
 *   · long-press 160ms pausa (haptic)
 *   · crossfade 360ms ease-out-expo entre páginas
 *   · reduced motion: no auto-advance, no crossfade, paginas estaticas
 *
 * Background cream-paper (no gradient forest) — el único hero del app
 * que rompe con el lenguaje cromático del resto. Statement editorial.
 */
export function ManifiestoHeroLive({ state }: ManifiestoHeroLiveProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()

  // Pages adapt to state — algunos estados quitan páginas (e.g. sin
  // fijos → solo 1 página). Mínimo 1 página garantizado.
  const pages = buildPages(state)
  const pageCount = pages.length

  const [pageIndex, setPageIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  // Reset on state change vive en el parent: el screen pasa
  // key={stateId-nonce} → React desmonta y re-monta este componente,
  // y los useState locales arrancan fresh. Mantenemos la dependencia
  // de `state.id` en el effect de progress driver más abajo para que
  // cualquier path que reuse el componente con state.id distinto
  // siga corriendo el reset visual.

  const progress = useSharedValue(0)
  const sceneAlpha = useSharedValue(1)
  const sceneRise = useSharedValue(0)

  // Advance handler (ref so setInterval-like effect can call latest)
  const advance = useCallback(() => {
    setPageIndex((idx) => (idx + 1 >= pageCount ? 0 : idx + 1))
  }, [pageCount])

  // Progress + crossfade driver
  useEffect(() => {
    cancelAnimation(progress)
    progress.value = 0

    if (!reduced) {
      sceneAlpha.value = 0
      sceneRise.value = 8
      sceneAlpha.value = withTiming(1, { duration: SCENE_TRANSITION_MS, easing: EXPO_OUT })
      sceneRise.value = withTiming(0, { duration: SCENE_TRANSITION_MS, easing: EXPO_OUT })
    } else {
      sceneAlpha.value = 1
      sceneRise.value = 0
    }

    if (isPaused || reduced || pageCount <= 1) return

    progress.value = withTiming(
      1,
      { duration: SCENE_DURATION_MS, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(advance)()
      },
    )
    return () => {
      cancelAnimation(progress)
    }
  }, [pageIndex, isPaused, reduced, pageCount, progress, sceneAlpha, sceneRise, advance, state.id])

  const sceneContentStyle = useAnimatedStyle(() => ({
    opacity: sceneAlpha.value,
    transform: [{ translateY: sceneRise.value }],
  }))

  // Tap zones + long-press pause
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handlePressIn = useCallback(() => {
    pauseTimer.current = setTimeout(() => {
      void triggerHaptic('selection')
      setIsPaused(true)
    }, 160)
  }, [])
  const handlePressOut = useCallback(() => {
    if (pauseTimer.current) {
      clearTimeout(pauseTimer.current)
      pauseTimer.current = null
    }
    if (isPaused) setIsPaused(false)
  }, [isPaused])
  const handleTapLeft = useCallback(() => {
    void triggerHaptic('selection')
    setPageIndex((i) => Math.max(0, i - 1))
  }, [])
  const handleTapRight = useCallback(() => {
    void triggerHaptic('selection')
    setPageIndex((i) => Math.min(pageCount - 1, i + 1))
  }, [pageCount])

  const bg = theme.isDark ? '#2A3A2F' : '#FFFBF2'
  const fg = theme.isDark ? '#F4FDF2' : '#0F2E1F'
  const fgSoft = theme.isDark ? 'rgba(244,253,242,0.72)' : 'rgba(15,46,31,0.72)'
  const accent = theme.isDark ? '#A6EF8F' : '#1F590D'
  const trackBg = theme.isDark ? 'rgba(244,253,242,0.18)' : 'rgba(15,46,31,0.16)'

  const currentPage = pages[pageIndex]

  return (
    <View style={[styles.card, { backgroundColor: bg }]}>
      {/* Progress bars Wrapped-grammar */}
      <View style={styles.progressRow}>
        {pages.map((_, idx) => (
          <ProgressSegment
            key={idx}
            index={idx}
            currentIndex={pageIndex}
            progress={progress}
            trackColor={trackBg}
            fillColor={accent}
          />
        ))}
      </View>

      {/* Brand mark */}
      <Text style={[styles.brand, { color: fgSoft }]}>
        MANIFIESTO · {state.monthLong.toUpperCase()}
      </Text>

      {/* Stage */}
      <Animated.View style={[styles.stage, sceneContentStyle]}>
        {currentPage ? (
          <>
            <Text style={[styles.eyebrow, { color: fgSoft }]}>
              {currentPage.eyebrow}
            </Text>
            <Text style={[styles.hero, { color: fg }]} accessibilityRole="header">
              {currentPage.line1}
            </Text>
            {currentPage.line2 ? (
              <Text style={[styles.hero, { color: fg }]}>{currentPage.line2}</Text>
            ) : null}
            <View style={[styles.rule, { backgroundColor: accent }]} />
            <Text style={[styles.kicker, { color: fgSoft }]}>{currentPage.kicker}</Text>
          </>
        ) : null}
      </Animated.View>

      {/* Tap zones — absolutely positioned over content */}
      <View style={styles.tapZones} pointerEvents="box-none">
        <Pressable
          onPress={handleTapLeft}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityLabel="Página anterior"
          style={styles.tapZoneLeft}
        />
        <Pressable
          onPress={handleTapRight}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityLabel="Página siguiente"
          style={styles.tapZoneRight}
        />
      </View>

      {/* Pause hint */}
      <Text style={[styles.hint, { color: fgSoft }]}>
        {isPaused
          ? 'En pausa.'
          : pageCount > 1
          ? 'Mantené presionado para pausar · tap para navegar'
          : ''}
      </Text>
    </View>
  )
}

// ── Build pages adaptive to state ─────────────────────────────────

interface Page {
  eyebrow: string
  line1: string
  line2?: string
  kicker: string
}

function buildPages(state: HeroState): Page[] {
  if (state.isEmpty) {
    return [
      {
        eyebrow: 'EMPEZAR',
        line1: 'Cargá tus',
        line2: 'gastos fijos.',
        kicker:
          'Una vez los configures, este lugar te dice cómo vas en cada ciclo.',
      },
    ]
  }
  const pages: Page[] = []

  // Page 1 — Estado: situación del momento
  if (state.cantidadVencidos > 0) {
    pages.push({
      eyebrow: 'URGENTE',
      line1: `${state.cantidadVencidos} ${state.cantidadVencidos === 1 ? 'fijo' : 'fijos'}`,
      line2: 'vencidos.',
      kicker: `${formatMoney(state.montoVencido)} en atraso. Es lo primero a resolver.`,
    })
  } else if (state.isAllPaid) {
    pages.push({
      eyebrow: 'HOY',
      line1: 'Estás',
      line2: 'al día.',
      kicker:
        state.daysRemaining <= 2
          ? 'El ciclo cierra en horas. Empezás el siguiente con margen.'
          : `${state.daysRemaining} días al cierre, sin nada pendiente.`,
    })
  } else if (state.cycleDayIndex <= 3 && state.cantidadPagados === 0) {
    pages.push({
      eyebrow: 'INICIO',
      line1: 'Arranca',
      line2: 'el ciclo.',
      kicker: `${state.cantidadFijos} fijos por delante · ${formatMoney(state.totalFijos)} total.`,
    })
  } else {
    pages.push({
      eyebrow: 'HOY',
      line1: `${state.cantidadPorPagarTotal} fijos`,
      line2: 'por pagar.',
      kicker: `${formatMoney(state.montoPorPagarTotal)} en lo que resta del ciclo.`,
    })
  }

  // Page 2 — Próximo (si hay)
  if (state.nextItem) {
    const days = state.nextItem.days
    const dayCopy = days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`
    pages.push({
      eyebrow: 'PRÓXIMO',
      line1: state.nextItem.name,
      line2: `${dayCopy}.`,
      kicker: `${formatMoney(state.nextItem.amount)}${state.nextItem.dayOfWeek !== 'hoy' ? ` · este ${state.nextItem.dayOfWeek}` : ''}.`,
    })
  }

  // Page 3 — Ciclo overview
  pages.push({
    eyebrow: `CICLO ${state.monthLong.toUpperCase()}`,
    line1: `${state.daysRemaining} ${state.daysRemaining === 1 ? 'día' : 'días'}`,
    line2: 'restantes.',
    kicker:
      state.totalFijos > 0
        ? `Vas ${state.paidPct}% pagado. Libre ${formatMoney(state.dineroLibre)}.`
        : `Libre ${formatMoney(state.dineroLibre)}.`,
  })

  return pages
}

// ── Progress segment ─────────────────────────────────────────────

function ProgressSegment({
  index,
  currentIndex,
  progress,
  trackColor,
  fillColor,
}: {
  index: number
  currentIndex: number
  progress: SharedValue<number>
  trackColor: string
  fillColor: string
}) {
  const fillStyle = useAnimatedStyle(() => {
    let pct: number
    if (index < currentIndex) pct = 1
    else if (index === currentIndex) pct = progress.value
    else pct = 0
    return { width: `${pct * 100}%` }
  })

  return (
    <View style={[progressStyles.track, { backgroundColor: trackColor }]}>
      <Animated.View
        style={[progressStyles.fill, { backgroundColor: fillColor }, fillStyle]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
    minHeight: 320,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 16,
  },
  brand: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
    marginBottom: 26,
  },
  stage: {
    minHeight: 200,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
    marginBottom: 14,
  },
  hero: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 44,
  },
  rule: {
    width: 32,
    height: 2,
    marginTop: 16,
    marginBottom: 10,
  },
  kicker: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    maxWidth: 280,
  },
  tapZones: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    bottom: 40,
    flexDirection: 'row',
  },
  tapZoneLeft: { width: '33%', height: '100%' },
  tapZoneRight: { flex: 1, height: '100%' },
  hint: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    textAlign: 'center',
    marginTop: 12,
  },
})

const progressStyles = StyleSheet.create({
  track: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
})
