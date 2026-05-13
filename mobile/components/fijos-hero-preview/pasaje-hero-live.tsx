import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { formatMoney } from '@/utils/money'
import { motionEasings } from '@/lib/motion/tokens'
import { useAppTheme } from '@/theme/theme-provider'
import type { HeroState } from './hero-states'

const ENTER = motionEasings.enterSmooth
const DASH_COUNT = 28

interface PasajeHeroLiveProps {
  state: HeroState
}

/**
 * Variant B · Pasaje del ciclo — boarding pass aesthetic.
 *
 * Animation choreography:
 *   0ms     brand row + ticket label fade in (220ms)
 *   140ms   route stations (ABR / MAY) fade in (320ms)
 *   220ms   route dashes draw left-to-right, each dash fades in
 *           sequentially (~20ms stagger, 28 dashes = ~560ms)
 *   800ms   today marker bounce-in (spring damping 11)
 *   820ms   today label fade-in
 *   900ms   ticket info 3 cols + perforation + stub band cascade
 *           (60ms stagger between rows)
 *
 * Today marker has continuous halo pulse (1.2s warm cycle) to signal
 * "current location".
 *
 * CountUpText drives the $ amounts.
 */
export function PasajeHeroLive({ state }: PasajeHeroLiveProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()

  const todayPct = useMemo(
    () => Math.max(0, Math.min(100, (state.cycleDayIndex / state.cycleDays) * 100)),
    [state.cycleDayIndex, state.cycleDays],
  )

  return (
    <LinearGradient
      colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.card, { borderColor: 'rgba(166,239,143,0.12)' }]}
    >
      {/* Top: brand + label */}
      <Cascade delay={0}>
        <View style={styles.top}>
          <View style={styles.brandRow}>
            <View style={[styles.brandSquare, { backgroundColor: theme.colors.heroAccent }]} />
            <Text style={[styles.brand, { color: theme.colors.heroAccent }]}>
              MANIFIESTO
            </Text>
          </View>
          <Text style={[styles.label, { color: theme.colors.heroMuted2 }]}>
            PASAJE DEL CICLO
          </Text>
        </View>
      </Cascade>

      {/* Route */}
      <View style={styles.route}>
        <Cascade delay={140}>
          <View style={styles.station}>
            <Text style={[styles.stationCode, { color: theme.colors.heroText }]}>
              {state.monthShort}
            </Text>
            <Text style={[styles.stationDate, { color: theme.colors.heroMuted2 }]}>
              05
            </Text>
          </View>
        </Cascade>

        <View style={styles.routeLine}>
          <RouteDashes
            todayPct={todayPct}
            accent={theme.colors.heroAccent}
            mutedTrack="rgba(242,234,211,0.30)"
            reduced={reduced}
          />
          <TodayMarker
            todayPct={todayPct}
            accent={theme.colors.heroAccent}
            border={theme.colors.heroText}
            reduced={reduced}
          />
          <TodayLabel
            todayPct={todayPct}
            cycleDay={state.cycleDayIndex}
            color={theme.colors.heroAccent}
            reduced={reduced}
          />
        </View>

        <Cascade delay={140}>
          <View style={styles.station}>
            <Text style={[styles.stationCode, { color: theme.colors.heroText }]}>
              {state.monthShortNext}
            </Text>
            <Text style={[styles.stationDate, { color: theme.colors.heroMuted2 }]}>
              05
            </Text>
          </View>
        </Cascade>
      </View>

      {/* Ticket info 3 cols */}
      <Cascade delay={900}>
        <View style={styles.ticketInfo}>
          <Col
            label="PAGADO"
            big={state.montoPagado}
            renderBig={(n) => formatMoney(Math.round(n))}
            small={`${state.cantidadPagados} ${state.cantidadPagados === 1 ? 'ítem' : 'ítems'}`}
            color={theme.colors.heroAccent}
          />
          <Col
            label="PRÓXIMO"
            big={state.nextItem ? state.nextItem.name : (state.isAllPaid ? 'Ninguno' : '—')}
            renderBig={(s) => String(s)}
            small={
              state.nextItem
                ? `en ${state.nextItem.days} ${state.nextItem.days === 1 ? 'día' : 'días'} · ${formatMoney(state.nextItem.amount)}`
                : state.isAllPaid
                ? 'todo pagado este ciclo'
                : 'no hay fijos cargados'
            }
            color={theme.colors.heroText}
            isString
          />
          <Col
            label="POR PAGAR"
            big={state.montoPorPagarTotal}
            renderBig={(n) => formatMoney(Math.round(n))}
            small={`${state.cantidadPorPagarTotal} ${state.cantidadPorPagarTotal === 1 ? 'ítem' : 'ítems'}`}
            color={state.montoPorPagarTotal > 0 ? '#F2A78C' : theme.colors.heroMuted2}
            alignRight
          />
        </View>
      </Cascade>

      {/* Perforation */}
      <Cascade delay={960}>
        <View style={styles.perforation}>
          <View
            style={[
              styles.perfNotchLeft,
              { backgroundColor: theme.colors.heroGradient[0] },
            ]}
          />
          <View style={styles.perfDashes}>
            {[...Array(20)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.perfDash,
                  { backgroundColor: 'rgba(242,234,211,0.30)' },
                ]}
              />
            ))}
          </View>
          <View
            style={[
              styles.perfNotchRight,
              { backgroundColor: theme.colors.heroGradient[0] },
            ]}
          />
        </View>
      </Cascade>

      {/* Stub band */}
      <Cascade delay={1020}>
        <View style={styles.stub}>
          <View>
            <Text style={[styles.stubLabel, { color: theme.colors.heroMuted2 }]}>
              ESTADO
            </Text>
            <View style={styles.stubStatus}>
              {state.cantidadVencidos > 0 ? (
                <>
                  <UrgentDot color="#F06A6A" reduced={reduced} />
                  <Text style={[styles.stubText, { color: '#F2A78C' }]}>
                    {state.cantidadVencidos} {state.cantidadVencidos === 1 ? 'vencido' : 'vencidos'} · {formatMoney(state.montoVencido)}
                  </Text>
                </>
              ) : state.isEmpty ? (
                <Text style={[styles.stubText, { color: theme.colors.heroMuted }]}>
                  Sin fijos cargados
                </Text>
              ) : state.isAllPaid ? (
                <Text style={[styles.stubText, { color: theme.colors.heroAccent }]}>
                  Todo pagado
                </Text>
              ) : (
                <Text style={[styles.stubText, { color: theme.colors.heroAccent }]}>
                  Al día
                </Text>
              )}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.stubLabel, { color: theme.colors.heroMuted2 }]}>
              LIBRE DEL CICLO
            </Text>
            <CountUpText
              value={state.dineroLibre}
              duration={1100}
              format={(n) => formatMoney(Math.round(n))}
              style={[styles.stubBig, { color: theme.colors.heroText }]}
            />
            <Text style={[styles.stubSmall, { color: theme.colors.heroMuted }]}>
              {state.pctSueldo}% del sueldo a fijos
            </Text>
          </View>
        </View>
      </Cascade>
    </LinearGradient>
  )
}

// ── Cascade entrance ──────────────────────────────────────────────

function Cascade({ delay, children }: { delay: number; children: React.ReactNode }) {
  const reduced = useReducedMotion()
  const opacity = useSharedValue(reduced ? 1 : 0)
  const y = useSharedValue(reduced ? 0 : 8)

  useEffect(() => {
    if (reduced) return
    opacity.value = withDelay(delay, withTiming(1, { duration: 460, easing: ENTER }))
    y.value = withDelay(delay, withTiming(0, { duration: 460, easing: ENTER }))
    return () => {
      cancelAnimation(opacity)
      cancelAnimation(y)
    }
  }, [delay, reduced, opacity, y])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }))

  return <Animated.View style={style}>{children}</Animated.View>
}

// ── Route dashes — draw left to right ─────────────────────────────

function RouteDashes({
  todayPct,
  accent,
  mutedTrack,
  reduced,
}: {
  todayPct: number
  accent: string
  mutedTrack: string
  reduced: boolean
}) {
  // Drive a single shared value 0→1 over ~560ms after the cascade
  // entrance, then each dash's opacity is gated by its index/count.
  const drawProgress = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) {
      drawProgress.value = 1
      return
    }
    drawProgress.value = withDelay(
      220,
      withTiming(1, { duration: 560, easing: Easing.linear }),
    )
    return () => cancelAnimation(drawProgress)
  }, [reduced, drawProgress])

  return (
    <View style={styles.routeDashes}>
      {[...Array(DASH_COUNT)].map((_, i) => (
        <Dash
          key={i}
          index={i}
          totalCount={DASH_COUNT}
          drawProgress={drawProgress}
          todayPct={todayPct}
          accent={accent}
          mutedTrack={mutedTrack}
        />
      ))}
    </View>
  )
}

function Dash({
  index,
  totalCount,
  drawProgress,
  todayPct,
  accent,
  mutedTrack,
}: {
  index: number
  totalCount: number
  drawProgress: SharedValue<number>
  todayPct: number
  accent: string
  mutedTrack: string
}) {
  // Position of this dash in % (0..100)
  const positionPct = (index / (totalCount - 1)) * 100
  const isPast = positionPct <= todayPct
  // Threshold within drawProgress (0..1) when this dash should appear
  const threshold = index / (totalCount - 1)

  const style = useAnimatedStyle(() => {
    const visible = drawProgress.value >= threshold ? 1 : 0
    return {
      opacity: visible,
    }
  })

  return (
    <Animated.View
      style={[
        styles.routeDash,
        { backgroundColor: isPast ? accent : mutedTrack },
        style,
      ]}
    />
  )
}

// ── Today marker — bounce in then continuous halo pulse ───────────

function TodayMarker({
  todayPct,
  accent,
  border,
  reduced,
}: {
  todayPct: number
  accent: string
  border: string
  reduced: boolean
}) {
  const scale = useSharedValue(reduced ? 1 : 0)
  const halo = useSharedValue(0.45)

  useEffect(() => {
    if (reduced) {
      scale.value = 1
      return
    }
    scale.value = withDelay(
      800,
      withSpring(1, { damping: 11, stiffness: 180, mass: 0.7 }),
    )
    halo.value = withDelay(
      1100,
      withRepeat(
        withSequence(
          withTiming(0.9, { duration: 900, easing: motionEasings.warm }),
          withTiming(0.45, { duration: 900, easing: motionEasings.warm }),
        ),
        -1,
        true,
      ),
    )
    return () => {
      cancelAnimation(scale)
      cancelAnimation(halo)
    }
  }, [reduced, scale, halo])

  const markerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))
  const haloStyle = useAnimatedStyle(() => ({
    opacity: halo.value,
    transform: [{ scale: scale.value * 1.6 }],
  }))

  return (
    <View
      style={[
        styles.markerWrapper,
        { left: `${todayPct}%` },
      ]}
      pointerEvents="none"
    >
      <Animated.View
        style={[
          styles.markerHalo,
          { backgroundColor: accent },
          haloStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.marker,
          { backgroundColor: accent, borderColor: border },
          markerStyle,
        ]}
      />
    </View>
  )
}

// ── Today label ──────────────────────────────────────────────────

function TodayLabel({
  todayPct,
  cycleDay,
  color,
  reduced,
}: {
  todayPct: number
  cycleDay: number
  color: string
  reduced: boolean
}) {
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    opacity.value = withDelay(
      900,
      withTiming(1, { duration: 360, easing: ENTER }),
    )
    return () => cancelAnimation(opacity)
  }, [reduced, opacity])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View
      style={[
        styles.todayLabel,
        // Clamp to keep label from clipping edges
        { left: `${Math.max(0, Math.min(82, todayPct - 8))}%` },
        style,
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.todayLabelText, { color }]}>
        HOY · día {cycleDay}
      </Text>
    </Animated.View>
  )
}

// ── Urgent dot — pulse continuous ─────────────────────────────────

function UrgentDot({ color, reduced }: { color: string; reduced: boolean }) {
  const scale = useSharedValue(1)
  useEffect(() => {
    if (reduced) return
    scale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 700, easing: motionEasings.warm }),
        withTiming(1, { duration: 700, easing: motionEasings.warm }),
      ),
      -1,
      true,
    )
    return () => cancelAnimation(scale)
  }, [reduced, scale])

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))
  return (
    <Animated.View
      style={[
        {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
        },
        style,
      ]}
    />
  )
}

// ── Column ────────────────────────────────────────────────────────

function Col({
  label,
  big,
  renderBig,
  small,
  color,
  alignRight,
  isString,
}: {
  label: string
  big: number | string
  renderBig: (v: never) => string
  small: string
  color: string
  alignRight?: boolean
  isString?: boolean
}) {
  const { theme } = useAppTheme()
  return (
    <View style={[styles.col, alignRight ? { alignItems: 'flex-end' } : null]}>
      <Text style={[styles.colLabel, { color: theme.colors.heroMuted2 }]}>
        {label}
      </Text>
      {isString ? (
        <Text
          style={[styles.colBig, { color }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {String(big)}
        </Text>
      ) : (
        <CountUpText
          value={Number(big)}
          duration={1100}
          format={(n) => (renderBig as (n: number) => string)(n)}
          style={[styles.colBig, { color }]}
        />
      )}
      <Text style={[styles.colSmall, { color: theme.colors.heroMuted }]}>
        {small}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 22,
    overflow: 'hidden',
    borderWidth: 1,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandSquare: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  brand: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
  },
  station: { alignItems: 'center' },
  stationCode: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  stationDate: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  routeLine: {
    flex: 1,
    height: 32,
    justifyContent: 'center',
    position: 'relative',
  },
  routeDashes: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 1.5,
    gap: 2,
  },
  routeDash: {
    flex: 1,
    height: 1.5,
  },
  markerWrapper: {
    position: 'absolute',
    top: 9,
    width: 14,
    height: 14,
    marginLeft: -7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  markerHalo: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 10,
  },
  todayLabel: {
    position: 'absolute',
    top: 24,
  },
  todayLabelText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  ticketInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
    gap: 8,
  },
  col: { flex: 1 },
  colLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  colBig: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  colSmall: {
    fontSize: 11,
    marginTop: 2,
  },
  perforation: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 14,
    marginHorizontal: -22,
    marginBottom: 14,
  },
  perfNotchLeft: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
  },
  perfNotchRight: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: -7,
  },
  perfDashes: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
  },
  perfDash: {
    flex: 1,
    height: 1,
  },
  stub: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  stubLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  stubStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stubText: {
    fontSize: 13,
    fontWeight: '700',
  },
  stubBig: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  stubSmall: {
    fontSize: 10,
    marginTop: 2,
  },
})
