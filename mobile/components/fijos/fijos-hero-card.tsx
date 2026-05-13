import { memo, useEffect, useState } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  LinearTransition,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { CardParticles } from '@/components/ui/card-particles'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { formatMoney } from '@/utils/money'
import { authTokens } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { decorativeDurations, motionEasings } from '@/lib/motion/tokens'

interface FijosHeroCardProps {
  mes?: string
  diasRestantes?: number
  totalFijos?: number
  montoPagado?: number
  cantidadPagados?: number
  cantidadPendientes?: number
  /** Subset de pendientes que están vencidos. Cuando > 0, el hero entra
   *  en estado urgente: dot color peach, badge "X VENCIDOS" al lado del
   *  título, sub-line state-aware con el count de atrasados. */
  cantidadVencidos?: number
  dineroLibre?: number
  porcentajeSueldo?: number
  /** Día actual del ciclo (1..cycleDays). Drive del today marker en la
   *  route line ABR → MAY del boarding pass. */
  cycleDayIndex?: number
  /** Total de días del ciclo. Default 30. */
  cycleDays?: number
}

/**
 * Fijos hero card — aligns with the Home/Gastos hero language:
 *  · LinearGradient shell driven by theme.heroGradient.
 *  · HeroAurora (three drifting blobs) + ShineOverlay (diagonal sweep).
 *  · BreatheDot next to the eyebrow label.
 *  · CountUpText for every monetary value (shared Reanimated hook).
 *  · RiseView cascade matching the screen-wide wave (0/80/160/240/320/400).
 *  · Animated.View layout={LinearTransition} so value changes transition
 *    the card height instead of snapping.
 */
function FijosHeroCardImpl({
  mes = 'Abril',
  diasRestantes = 0,
  totalFijos = 0,
  montoPagado = 0,
  cantidadPagados = 0,
  cantidadPendientes = 0,
  cantidadVencidos = 0,
  dineroLibre = 0,
  porcentajeSueldo = 0,
  cycleDayIndex = 1,
  cycleDays = 30,
}: FijosHeroCardProps) {
  const { theme } = useAppTheme()
  const porcentaje = totalFijos > 0 ? Math.round((montoPagado / totalFijos) * 100) : 0
  const montoPendiente = Math.max(0, totalFijos - montoPagado)
  // Derived state — el hero se viste según urgencia:
  //   isAllPaid     → todo pagado este ciclo (celebración sutil)
  //   hasOverdue    → al menos un vencido (peach, urgent)
  //   notStarted    → ciclo recién arrancado (muted, sin pagar nada todavía)
  //   inProgress    → ritmo normal (heroAccent default)
  const isAllPaid = cantidadPendientes === 0 && cantidadPagados > 0
  const hasOverdue = cantidadVencidos > 0
  const notStarted = cantidadPagados === 0 && cantidadVencidos === 0 && cantidadPendientes > 0

  // Status color drive: breathe dot + título color + (futuro) badge tint
  const statusColor = hasOverdue
    ? '#F2A78C' // peach (urgent)
    : notStarted
      ? theme.colors.heroMuted // muted (just started)
      : theme.colors.heroAccent // lime (in-progress / paid)

  // ── Unique touch · urgency border pulse ───────────────────────────
  // Cuando hay vencidos, el accent ring del hero hace un pulse calmo
  // pero notorio (alpha 0.12 → 0.42 → 0.12 en 2.4s warm). No es un
  // halo aparte, es un overlay sutil que respira con urgencia. Detrás
  // de las particles y el shine para que no compita con ellos.
  const reduced = useReducedMotion()
  const urgencyPulse = useSharedValue(0)
  useEffect(() => {
    if (!hasOverdue || reduced) {
      cancelAnimation(urgencyPulse)
      urgencyPulse.value = 0
      return
    }
    urgencyPulse.value = withRepeat(
      withSequence(
        // @motion-allow: 2400ms calm-urgent pulse — más lento que el breathe dot
        // para que se lea como urgencia ambient, no como flashing distractor
        withTiming(1, { duration: 1200, easing: motionEasings.warm }),
        withTiming(0, { duration: 1200, easing: motionEasings.warm }),
      ),
      -1,
      false,
    )
    return () => cancelAnimation(urgencyPulse)
  }, [hasOverdue, reduced, urgencyPulse])
  const urgencyRingStyle = useAnimatedStyle(() => ({
    opacity: 0.12 + urgencyPulse.value * 0.3,
  }))

  // Sub-line state-aware — reemplaza el "Quedan X días en el ciclo"
  // estático con info más útil según el momento del ciclo. Cada caso
  // dice algo distinto · ningún caso duplica info que ya esté en el
  // badge (impeccable: no repetir el mismo dato en dos sitios).
  const resolveSubtitle = (): string => {
    if (isAllPaid && diasRestantes <= 1) {
      return diasRestantes === 0 ? 'Todo pagado · cierre hoy' : 'Todo pagado · cobrás mañana'
    }
    if (isAllPaid) {
      return `Todo pagado · ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'} al cierre`
    }
    if (hasOverdue) {
      // Badge "X VENCIDOS" arriba ya cuenta los atrasados.
      // Sub-line accionable: qué hacer + cuánto tiempo queda.
      return `Resolvé los atrasados · ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'} al cierre`
    }
    if (notStarted) {
      return `Recién arrancado · ${cantidadPendientes} pendientes`
    }
    return `${cantidadPendientes} ${cantidadPendientes === 1 ? 'pendiente' : 'pendientes'} · ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'} al cierre`
  }

  return (
    <RiseView delay={40}>
      <Animated.View layout={LinearTransition.duration(260)}>
        <LinearGradient
          colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[styles.card, { borderColor: 'rgba(166,239,143,0.12)' }]}
        >
          {/* Urgency ring · pulsa peach calm cuando hay vencidos. Detrás
              del shine y las particles. PointerEvents none. */}
          {hasOverdue ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.urgencyRing, urgencyRingStyle]}
            />
          ) : null}
          <ShineOverlay
            width={430}
            height={360}
            tint={theme.colors.shineOverlay}
            delayMs={1000}
            periodMs={4200}
          />
          {/* Twinkling firefly field — same shared-wave technique
              as the Home and Gastos hero cards. */}
          <CardParticles count={12} accentColor={authTokens.peach} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <BreatheDot
                size={8}
                color={statusColor}
                glow={statusColor}
              />
              <Text style={[styles.titulo, { color: statusColor }]}>
                {/* "· {mes}" removido — la CycleRouteLine abajo ya
                    muestra el ciclo (ABR 05 → MAY 05) con today marker.
                    Impeccable: una sola surface por dato. */}
                Gastos fijos
              </Text>
            </View>
            {hasOverdue ? (
              <View
                style={[
                  styles.urgentBadge,
                  { backgroundColor: 'rgba(240,106,106,0.18)', borderColor: 'rgba(240,106,106,0.5)' },
                ]}
                accessibilityLabel={`${cantidadVencidos} ${cantidadVencidos === 1 ? 'vencido' : 'vencidos'}`}
              >
                <Text style={styles.urgentBadgeText}>
                  {cantidadVencidos} {cantidadVencidos === 1 ? 'VENCIDO' : 'VENCIDOS'}
                </Text>
              </View>
            ) : null}
            {isAllPaid ? (
              <View
                style={[
                  styles.celebrateBadge,
                  { backgroundColor: 'rgba(166,239,143,0.18)', borderColor: 'rgba(166,239,143,0.45)' },
                ]}
                accessibilityLabel="Todo al día"
              >
                <Text style={styles.celebrateBadgeText}>AL DÍA</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.subtitulo, { color: theme.colors.heroMuted2 }]}>
            {resolveSubtitle()}
          </Text>

          <View style={styles.montosRow}>
            <View>
              <Text style={[styles.montoLabel, { color: theme.colors.heroMuted2 }]}>
                Ya pagaste
              </Text>
              <CountUpText
                value={montoPagado}
                format={(n) => formatMoney(n)}
                style={[styles.montoPagado, { color: theme.colors.heroText }]}
              />
              {/* Item count absorbed del StatCard viejo "Pagados". Sin
                  nested card, inline como sub-label del monto.
                  Vocabulary: "pagados / pendientes" canon — alineado
                  con el tab pill correspondiente. */}
              <Text style={[styles.montoSub, { color: theme.colors.heroAccent }]}>
                {cantidadPagados} {cantidadPagados === 1 ? 'pagado' : 'pagados'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.montoLabel, { color: theme.colors.heroMuted2 }]}>
                Te falta pagar
              </Text>
              <CountUpText
                value={montoPendiente}
                format={(n) => formatMoney(n)}
                style={[styles.montoPendiente, { color: '#F2A78C' }]}
              />
              {/* Item count absorbed del StatCard viejo "Por pagar".
                  Cuando hay vencidos, el badge "X VENCIDOS" arriba
                  los contabiliza — no duplicamos esa info acá. */}
              <Text style={[styles.montoSub, { color: '#F2A78C' }]}>
                {cantidadPendientes} {cantidadPendientes === 1 ? 'pendiente' : 'pendientes'}
              </Text>
            </View>
          </View>

          <ProgressBar porcentaje={porcentaje} accent={theme.colors.heroAccent} />
          <View style={styles.progressFooter}>
            <Text style={[styles.progressPct, { color: theme.colors.heroAccent }]}>
              {porcentaje}% pagado
            </Text>
            <Text style={[styles.progressTotal, { color: theme.colors.heroMuted2 }]}>
              Total: {formatMoney(totalFijos)}
            </Text>
          </View>

          {/* ── Route line ABR → MAY (boarding pass) ──────────────
              Fusion con la variante Pasaje del ciclo. Una sola línea
              de tiempo: stations + dashes con today marker. Eje
              tiempo del ciclo, separado del eje pago (que es la
              progress bar de arriba). */}
          <CycleRouteLine
            cycleLabel={mes}
            cycleDayIndex={cycleDayIndex}
            cycleDays={cycleDays}
            accent={theme.colors.heroAccent}
            mutedTrack="rgba(242,234,211,0.22)"
            cream={theme.colors.heroText}
            muted2={theme.colors.heroMuted2}
          />

          {/* ── Perforation (boarding pass stub separator) ────────
              Notches semi-circulares en los bordes + dashes
              horizontales. Substituye al borderTop hardcoded
              "rgba(255,255,255,0.12)" del bottomRow viejo con un
              divider con personalidad. */}
          <View style={styles.perforation}>
            <View
              style={[
                styles.perfNotchLeft,
                { backgroundColor: theme.colors.heroGradient[0] },
              ]}
            />
            <View style={styles.perfDashes}>
              {Array.from({ length: 22 }).map((_, i) => (
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

          <View style={styles.bottomRow}>
            <View>
              <Text style={[styles.bottomLabel, { color: theme.colors.heroAccent }]}>
                {/* "ESTE MES" removido — impeccable rule: redundante con
                    el eyebrow "GASTOS FIJOS · ABRIL" del header. */}
                DINERO LIBRE
              </Text>
              <CountUpText
                value={dineroLibre}
                format={(n) => formatMoney(n)}
                style={[styles.bottomMonto, { color: theme.colors.heroText }]}
              />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.bottomPctLabel, { color: theme.colors.heroMuted2 }]}>
                de tu sueldo
              </Text>
              <Text style={[styles.bottomPct, { color: theme.colors.heroMuted }]}>
                {porcentajeSueldo}%
              </Text>
              <Text style={[styles.bottomPctSub, { color: theme.colors.heroAccent }]}>
                va a fijos
              </Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </RiseView>
  )
}

function ProgressBar({ porcentaje, accent }: { porcentaje: number; accent: string }) {
  const reduced = useReducedMotion()
  const progress = useSharedValue(reduced ? clampPct(porcentaje) : 0)
  const dotScale = useSharedValue(reduced ? 1 : 0)
  const dotGlow = useSharedValue(0.55)

  useEffect(() => {
    if (reduced) {
      progress.value = clampPct(porcentaje)
      dotScale.value = 1
      return
    }
    progress.value = withDelay(
      80,
      // @motion-allow: 900ms one-shot progress fill on hero; deliberately faster than pulse (1200) for snappy intro
      withTiming(clampPct(porcentaje), {
        duration: 900,
        easing: motionEasings.decelerate,
      }),
    )
    dotScale.value = withDelay(
      680,
      // @motion-allow: bouncy first-paint celebration on Fijos hero, intentionally idiosyncratic
      withSpring(1, { damping: 11, stiffness: 180, mass: 0.7 }),
    )
    dotGlow.value = withDelay(
      900,
      withRepeat(
        withSequence(
          withTiming(1, { duration: decorativeDurations.pulse, easing: motionEasings.warm }),
          withTiming(0.55, { duration: decorativeDurations.pulse, easing: motionEasings.warm }),
        ),
        -1,
        true,
      ),
    )
    return () => {
      cancelAnimation(progress)
      cancelAnimation(dotScale)
      cancelAnimation(dotGlow)
    }
  }, [porcentaje, reduced, progress, dotScale, dotGlow])

  // Fill uses scaleX (GPU transform, no layout). `transformOrigin: left`
  // anchors the scale to the track's left edge.
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }))
  // Dot rides the end of the fill. Previously this animated `left: %`
  // which forces a per-frame layout pass on Android. We now measure
  // the track once via onLayout and convert progress (0..1) into a
  // pixel translateX — pure compositor work.
  const [trackWidthPx, setTrackWidthPx] = useState(0)
  const handleTrackLayout = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width
    if (w > 0 && w !== trackWidthPx) setTrackWidthPx(w)
  }
  const dotStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * trackWidthPx - 7 },
      { scale: dotScale.value },
    ],
    opacity: dotGlow.value,
  }))

  return (
    <View
      onLayout={handleTrackLayout}
      style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
    >
      <Animated.View
        style={[
          styles.progressFill,
          { backgroundColor: accent },
          fillStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.progressDot,
          {
            backgroundColor: '#F2EAD3',
            borderColor: accent,
            shadowColor: accent,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: 4,
            elevation: 3,
          },
          dotStyle,
        ]}
      />
    </View>
  )
}

function clampPct(p: number): number {
  return Math.min(Math.max(p, 0), 100) / 100
}

/**
 * CycleRouteLine — fusion del boarding pass aesthetic en el hero.
 * Renderea la geometría del ciclo como una ruta: estación origen +
 * dashed track + today marker + estación destino. Eje TIEMPO, separado
 * del eje pago (que cubre la ProgressBar de arriba).
 *
 * Parsea el cycleLabel canonical "DD MON → DD MON" para extraer las
 * dos estaciones. Today marker se posiciona a `cycleDayIndex / cycleDays`
 * a lo largo del track, con label "día X / Y" debajo.
 *
 * Cero animation interna de entrada — el wrap RiseView del hero ya
 * envuelve esto. Mantiene el motion budget del card bajo control.
 */
function CycleRouteLine({
  cycleLabel,
  cycleDayIndex,
  cycleDays,
  accent,
  mutedTrack,
  cream,
  muted2,
}: {
  cycleLabel: string
  cycleDayIndex: number
  cycleDays: number
  accent: string
  mutedTrack: string
  cream: string
  muted2: string
}) {
  const stations = parseCycleStations(cycleLabel)
  const safePct = Math.max(0, Math.min(100, (cycleDayIndex / cycleDays) * 100))
  const DASH_COUNT = 24

  // Clamp label position al rango [0%, 82%] para que no se clipée en el
  // borde derecho cuando estamos cerca del final del ciclo.
  const labelLeft = Math.max(0, Math.min(82, safePct - 8))

  return (
    <View style={styles.routeLine}>
      <View style={styles.station}>
        <Text style={[styles.stationCode, { color: cream }]}>
          {stations.from.code}
        </Text>
        <Text style={[styles.stationDate, { color: muted2 }]}>
          {stations.from.date}
        </Text>
      </View>

      <View style={styles.routeTrack}>
        <View style={styles.routeDashes}>
          {Array.from({ length: DASH_COUNT }).map((_, i) => {
            const dashPct = (i / (DASH_COUNT - 1)) * 100
            const isPast = dashPct <= safePct
            return (
              <View
                key={i}
                style={[
                  styles.routeDash,
                  { backgroundColor: isPast ? accent : mutedTrack },
                ]}
              />
            )
          })}
        </View>
        <View
          style={[
            styles.todayMarker,
            {
              left: `${safePct}%`,
              backgroundColor: accent,
              borderColor: cream,
            },
          ]}
          pointerEvents="none"
        />
        <Text
          style={[
            styles.todayLabel,
            { color: accent, left: `${labelLeft}%` },
          ]}
        >
          HOY · DÍA {cycleDayIndex}
        </Text>
      </View>

      <View style={styles.station}>
        <Text style={[styles.stationCode, { color: cream }]}>
          {stations.to.code}
        </Text>
        <Text style={[styles.stationDate, { color: muted2 }]}>
          {stations.to.date}
        </Text>
      </View>
    </View>
  )
}

/**
 * Parsea "5 abr → 5 may" → { from: { code: 'ABR', date: '05' }, ... }
 * Si no parsea (cycle label custom o vacío), devuelve fallback dignos.
 */
function parseCycleStations(label: string): {
  from: { code: string; date: string }
  to: { code: string; date: string }
} {
  const parts = label.split('→').map((s) => s.trim())
  const parseSide = (side: string | undefined) => {
    if (!side) return { code: '--', date: '--' }
    const [dateRaw, monRaw] = side.split(/\s+/)
    return {
      code: (monRaw ?? '---').toUpperCase().slice(0, 3),
      date: dateRaw ? String(dateRaw).padStart(2, '0') : '--',
    }
  }
  return {
    from: parseSide(parts[0]),
    to: parseSide(parts[1]),
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  // Urgency ring — overlay absolute con border peach que pulsa cuando
  // hay vencidos. Detrás del contenido, pointerEvents=none.
  urgencyRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#F2A78C',
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  urgentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  urgentBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#FFB59E',
  },
  celebrateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  celebrateBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#A6EF8F',
  },
  subtitulo: {
    fontSize: 12,
    marginTop: 4,
  },
  montosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 16,
    marginBottom: 10,
  },
  montoSub: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 3,
  },
  // ── Boarding pass route line + perforation ──────────────────
  routeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    marginBottom: 10,
  },
  station: { alignItems: 'center' },
  stationCode: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  stationDate: {
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  routeTrack: {
    flex: 1,
    height: 22,
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
  todayMarker: {
    position: 'absolute',
    top: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    marginLeft: -7,
  },
  todayLabel: {
    position: 'absolute',
    top: 18,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  perforation: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 14,
    marginHorizontal: -20, // bleed a los bordes del card (padding=20)
    marginBottom: 12,
    marginTop: 2,
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
  montoLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  montoPagado: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 30,
  },
  montoPendiente: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 22,
  },
  progressTrack: {
    position: 'relative',
    height: 8,
    borderRadius: 99,
    overflow: 'visible',
    marginBottom: 6,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    borderRadius: 99,
    transformOrigin: 'left' as const,
  },
  progressDot: {
    position: 'absolute',
    top: -3,
    left: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  progressPct: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressTotal: {
    fontSize: 11,
  },
  // statsRow + statCard + iconBadge + statLabel + statValue + statSublabel
  // styles eliminados — las 2 StatCard nested (impeccable ban) fueron
  // absorbidas en montoSub inline + reemplazadas por la CycleRouteLine
  // boarding pass.
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // Sin borderTopWidth — la perforation arriba ya hace el divider
    // con personalidad de boarding pass stub.
  },
  bottomLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  bottomMonto: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 26,
  },
  bottomPctLabel: {
    fontSize: 11,
  },
  bottomPct: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  bottomPctSub: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'right',
  },
})

/**
 * Memo wrap. FijosHeroCard es el componente más pesado de Fijos
 * (LinearGradient + ShineOverlay + CardParticles + ProgressBar
 * animated + dot pulse glow + 2 StatCards + 2 CountUpText).
 * Sin memo cada parent render reevaluaba todas las animations.
 *
 * Todos los props son primitives (numbers + strings) — shallow compare
 * exacto cuando los aggregates del controller no cambian.
 */
export const FijosHeroCard = memo(FijosHeroCardImpl)
