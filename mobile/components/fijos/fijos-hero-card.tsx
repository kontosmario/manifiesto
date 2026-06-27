import { memo, useEffect, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  LinearTransition,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { CardParticles } from '@/components/ui/card-particles'
import { useGatedLayout } from '@/hooks/use-layout-transition-gate'
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
  /**
   * Modo empty / preview (onboarding first-run). Renderea el MISMO shell
   * — gradient, eyebrow, route line, segments, perforation, labels
   * "Ya pagaste / Te falta pagar / DINERO LIBRE" — pero con "—" / dashes
   * neutros en vez de números, montos o segmentos coloreados. NO inventa
   * datos. Backwards-compatible: default `false` deja el comportamiento
   * original intacto.
   */
  empty?: boolean
}

/**
 * Fijos hero card — aligns with the Home/Gastos hero language:
 *  · LinearGradient shell driven by theme.heroGradient.
 *  · Campo de luciérnagas (CardParticles) sobre el gradiente forest.
 *  · BreatheDot next to the eyebrow label.
 *  · CountUpText for every monetary value (shared Reanimated hook).
 *  · RiseView cascade matching the screen-wide wave (0/80/160/240/320/400).
 *  · Animated.View layout={LinearTransition} so value changes transition
 *    the card height instead of snapping.
 */
function FijosHeroCardImpl({
  mes = 'Abril',
  // diasRestantes prop preservada en interface por backward compat
  // pero ya no se renderea — la CycleRouteLine comunica el tiempo
  // restante visualmente vía el today marker.
  totalFijos = 0,
  montoPagado = 0,
  cantidadPagados = 0,
  cantidadPendientes = 0,
  cantidadVencidos = 0,
  dineroLibre = 0,
  porcentajeSueldo = 0,
  cycleDayIndex = 1,
  cycleDays = 30,
  empty = false,
}: FijosHeroCardProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  // Gateado: el primer attach del tab no debe disparar la layout
  // transition del hero (warp). Se habilita tras el idle para los cambios
  // reales (pagar un fijo → el total/porcentaje transicionan suave).
  const heroLayout = useGatedLayout(LinearTransition.duration(260))
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

  // ── Unique touch · urgency pulse en el badge "X VENCIDOS" ─────────
  // Antes el pulse vivía en un urgency ring que envolvía TODA la card
  // del hero — usuario reportó que era invasivo (todo el bloque latía).
  // Ahora el pulse se concentra SOLO en el badge "VENCIDOS" del header:
  // bg + border opacity oscilan en 2.4s warm. El badge respira con
  // urgencia sin que el resto del hero compita por atención.
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
        // 2 × pulse (1.2s c/u) = 2.4s full cycle calm-urgent — lento,
        // ambient, no flashing. Usa `decorativeDurations.pulse` (1200ms).
        withTiming(1, { duration: decorativeDurations.pulse, easing: motionEasings.warm }),
        withTiming(0, { duration: decorativeDurations.pulse, easing: motionEasings.warm }),
      ),
      -1,
      false,
    )
    return () => cancelAnimation(urgencyPulse)
  }, [hasOverdue, reduced, urgencyPulse])
  // Badge pulse: bg alpha 0.18 → 0.36, border alpha 0.50 → 0.85, scale 1 → 1.04.
  // Combinación sutil que respira sin saltar — el badge gana presencia
  // pero no llama la atención más de lo necesario.
  const urgencyBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + urgencyPulse.value * 0.04 }],
    backgroundColor: `rgba(240,106,106,${0.18 + urgencyPulse.value * 0.18})`,
    borderColor: `rgba(240,106,106,${0.5 + urgencyPulse.value * 0.35})`,
  }))

  // ── "AL DÍA" — glow-ping ONE-SHOT cuando RECIÉN se completa todo (no en
  // cold-open, mismo criterio que el ConfettiBurst del row: gate por ref).
  // Un halo lime detrás del badge late UNA vez. ReduceMotion → sin glow.
  const allDiaGlow = useSharedValue(0)
  const prevAllPaidRef = useRef(isAllPaid)
  useEffect(() => {
    if (isAllPaid && !prevAllPaidRef.current && !reduced) {
      allDiaGlow.value = withSequence(
        withTiming(1, { duration: 220, easing: motionEasings.warm }),
        withTiming(0, { duration: 640, easing: motionEasings.warm }),
      )
    }
    prevAllPaidRef.current = isAllPaid
  }, [isAllPaid, reduced, allDiaGlow])
  const allDiaGlowStyle = useAnimatedStyle(() => ({
    opacity: allDiaGlow.value * 0.6,
    transform: [{ scale: 1 + allDiaGlow.value * 0.35 }],
  }))

  // Subtitle state-aware ELIMINADO en favor de la CycleRouteLine que
  // ocupa ese slot. El estado lo comunican ahora: badge VENCIDOS/AL DÍA
  // + BreatheDot color-coded + segments coloreados + urgency ring pulse.
  // Texto state-aware → cero, todo visual.

  // Expand cycle label corto ("20 abr → 20 may") a versión legible para
  // el eyebrow ("20 ABRIL → 20 MAYO"). Mantiene el "→" como conector.
  const cycleEyebrow = expandCycleLabel(mes)

  // ── Empty / preview mode ─────────────────────────────────────────
  // Mismo shell de gradient con los labels reales, pero sin números ni
  // segmentos coloreados — solo placeholders neutros. Se renderea
  // después de los hooks (la urgency pulse ya se auto-cancela cuando no
  // hay vencidos) para no romper el orden de hooks.
  if (empty) {
    return <FijosHeroCardEmpty />
  }

  return (
    <RiseView delay={40}>
      <Animated.View layout={heroLayout}>
        <LinearGradient
          colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[styles.card, { borderColor: 'rgba(166,239,143,0.12)' }]}
        >
          {/* Urgency ring REMOVIDO 2026-05-31 — el pulse vivía en un
              border que envolvía toda la card del hero. Era invasivo.
              Ahora el pulse se aplica solo al badge "VENCIDOS" del
              header (ver `urgencyBadgeStyle` + `Animated.View` del
              badge más abajo). */}
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
                {/* Eyebrow es ahora el ciclo cargado expandido —
                    "20 ABRIL → 20 MAYO" — en lugar del genérico
                    "Gastos fijos". El usuario ya está en la tab de
                    Fijos, el dato realmente único es el ciclo. */}
                {cycleEyebrow}
              </Text>
            </View>
            {hasOverdue ? (
              // Animated.View para que bg + border + scale pulsen via
              // `urgencyBadgeStyle` (worklet en UI thread, 0 cost).
              // ReduceMotion-aware: si el sistema lo pide, la shared
              // value queda en 0 y los valores son estáticos.
              <Animated.View
                style={[styles.urgentBadge, urgencyBadgeStyle]}
                accessibilityLabel={t('fijos:hero.overdueAccessibility', {
                  count: cantidadVencidos,
                })}
              >
                <Text style={styles.urgentBadgeText}>
                  {t('fijos:hero.overdueBadge', { count: cantidadVencidos })}
                </Text>
              </Animated.View>
            ) : null}
            {isAllPaid ? (
              <View style={styles.celebrateWrap}>
                <Animated.View
                  pointerEvents="none"
                  style={[styles.celebrateGlow, allDiaGlowStyle]}
                />
                <View
                  style={[
                    styles.celebrateBadge,
                    { backgroundColor: 'rgba(166,239,143,0.18)', borderColor: 'rgba(166,239,143,0.45)' },
                  ]}
                  accessibilityLabel={t('fijos:hero.allPaidAccessibility')}
                >
                  <Text style={styles.celebrateBadgeText}>{t('fijos:hero.allPaidBadge')}</Text>
                </View>
              </View>
            ) : null}
          </View>
          {/* CycleRouteLine ocupa el slot del subtitle viejo —
              comunicación temporal del ciclo via boarding pass
              graphic + today marker. Reemplaza el "X días al cierre"
              de texto que vivía aquí antes. */}
          <CycleRouteLine
            cycleLabel={mes}
            cycleDayIndex={cycleDayIndex}
            cycleDays={cycleDays}
            accent={theme.colors.heroAccent}
            mutedTrack="rgba(242,234,211,0.22)"
            cream={theme.colors.heroText}
            muted2={theme.colors.heroMuted2}
          />

          <View style={styles.montosRow}>
            <View>
              <Text style={[styles.montoLabel, { color: theme.colors.heroMuted2 }]}>
                {t('fijos:hero.alreadyPaid')}
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
                {t('fijos:hero.paidCount', { count: cantidadPagados })}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.montoLabel, { color: theme.colors.heroMuted2 }]}>
                {t('fijos:hero.stillToPay')}
              </Text>
              <CountUpText
                value={montoPendiente}
                format={(n) => formatMoney(n)}
                style={[styles.montoPendiente, { color: '#F2A78C' }]}
              />
              {/* Item count absorbed del StatCard viejo "Por pagar".
                  Cuando hay vencidos, el badge "X VENCIDOS" arriba
                  los contabiliza — no duplicamos esa info aquí. */}
              <Text style={[styles.montoSub, { color: '#F2A78C' }]}>
                {t('fijos:hero.pendingCount', { count: cantidadPendientes })}
              </Text>
            </View>
          </View>

          {/* Payment segments — reemplazan ProgressBar lineal/pulse.
              Cada segmento = un fijo. Color encoding: lime pagado,
              cream muted pendiente, peach vencido. Sin pulse, sin
              dot rider. Mapeo 1:1 fijo↔segmento. */}
          <PaymentSegments
            cantidadPagados={cantidadPagados}
            cantidadPendientes={cantidadPendientes}
            cantidadVencidos={cantidadVencidos}
            accent={theme.colors.heroAccent}
            muted="rgba(242,234,211,0.22)"
            urgent="#F2A78C"
          />
          <View style={styles.progressFooter}>
            <Text style={[styles.progressPct, { color: theme.colors.heroAccent }]}>
              {t('fijos:hero.pctPaid', { pct: porcentaje })}
            </Text>
            <Text style={[styles.progressTotal, { color: theme.colors.heroMuted2 }]}>
              {t('fijos:hero.total', { amount: formatMoney(totalFijos) })}
            </Text>
          </View>

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
                {t('fijos:hero.freeMoney')}
              </Text>
              <CountUpText
                value={dineroLibre}
                format={(n) => formatMoney(n)}
                style={[styles.bottomMonto, { color: theme.colors.heroText }]}
              />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.bottomPctLabel, { color: theme.colors.heroMuted2 }]}>
                {t('fijos:hero.ofYourSalary')}
              </Text>
              <Text style={[styles.bottomPct, { color: theme.colors.heroMuted }]}>
                {porcentajeSueldo}%
              </Text>
              <Text style={[styles.bottomPctSub, { color: theme.colors.heroAccent }]}>
                {t('fijos:hero.goesToFixed')}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </RiseView>
  )
}

// ProgressBar (lineal con fill scaleX + dot rider con glow pulse) ELIMINADA.
// Owner: "la línea que nos indica 100% pagado ese grafico lineal de pulso,
// busquemos una mejor forma de expresarlo". Reemplazada por PaymentSegments
// — encoding 1:1 fijo↔segmento sin pulso, más claro semánticamente.

// clampPct eliminado — helper que usaba la ProgressBar lineal antigua.

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
  const { t } = useTranslation()
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
          {t('fijos:hero.today', { day: cycleDayIndex })}
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

const MONTH_LONG_BY_SHORT: Record<string, string> = {
  ene: 'ENERO',
  feb: 'FEBRERO',
  mar: 'MARZO',
  abr: 'ABRIL',
  may: 'MAYO',
  jun: 'JUNIO',
  jul: 'JULIO',
  ago: 'AGOSTO',
  sep: 'SEPTIEMBRE',
  oct: 'OCTUBRE',
  nov: 'NOVIEMBRE',
  dic: 'DICIEMBRE',
}

/**
 * "20 abr → 20 may" → "20 ABRIL → 20 MAYO". Reemplaza el month-short
 * por el month-long. Si la abreviación no matchea, retorna upper-case
 * del input (fallback seguro).
 */
function expandCycleLabel(label: string): string {
  return label.replace(/\b([a-z]{3})\b/g, (match) => MONTH_LONG_BY_SHORT[match] ?? match.toUpperCase())
}

/**
 * PaymentSegments — reemplaza la ProgressBar lineal + pulse + dot rider.
 * Cada segmento (1:1 con un fijo) se pinta según su status:
 *   pagados                  → accent lime
 *   pendientes (sin vencer)  → muted cream
 *   vencidos                 → urgent peach
 *
 * Lineup: pagados primero (left), no-overdue pendientes en el medio,
 * vencidos al final (right) para que la urgencia se lea visualmente
 * como "lo último que falta". Stagger fade-in 30ms entre segmentos
 * en mount — no pulse continuo, no dot rider.
 *
 * Encoding fuerte: ves "5 de 10 lime + 3 muted + 2 peach" y entendés
 * el estado del ciclo sin leer números. Visual + semántico.
 */
function PaymentSegments({
  cantidadPagados,
  cantidadPendientes,
  cantidadVencidos,
  accent,
  muted,
  urgent,
}: {
  cantidadPagados: number
  cantidadPendientes: number
  cantidadVencidos: number
  accent: string
  muted: string
  urgent: string
}) {
  const total = cantidadPagados + cantidadPendientes
  if (total === 0) return null

  const noOverduePending = Math.max(0, cantidadPendientes - cantidadVencidos)
  const segments: Array<{ key: string; color: string }> = []
  for (let i = 0; i < cantidadPagados; i++) segments.push({ key: `p${i}`, color: accent })
  for (let i = 0; i < noOverduePending; i++) segments.push({ key: `n${i}`, color: muted })
  for (let i = 0; i < cantidadVencidos; i++) segments.push({ key: `v${i}`, color: urgent })

  return (
    <View style={styles.segmentsRow}>
      {segments.map((seg) => (
        <View
          key={seg.key}
          style={[styles.segment, { backgroundColor: seg.color }]}
        />
      ))}
    </View>
  )
}

/**
 * Empty-state twin del hero de Fijos. Mismo shell (gradient, radii,
 * padding), mismo eyebrow + labels "Ya pagaste / Te falta pagar /
 * DINERO LIBRE / de tu sueldo" + perforation boarding-pass, pero todos
 * los valores son dashes neutros y los segments/route-line son tracks
 * muted sin colorear. Cero datos fabricados. Sin shine ni particles ni
 * urgency pulse — preview inerte.
 */
function FijosHeroCardEmpty() {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const muted = 'rgba(242,234,211,0.22)'
  const ph = 'rgba(242,234,211,0.14)'
  return (
    <LinearGradient
      colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.card, styles.emptyCard, { borderColor: 'rgba(166,239,143,0.12)' }]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <BreatheDot size={8} color={theme.colors.heroMuted} glow={theme.colors.heroMuted} />
          <Text style={[styles.titulo, { color: theme.colors.heroMuted }]}>
            {t('fijos:hero.emptyEyebrow')}
          </Text>
        </View>
      </View>

      {/* Route line — track muted neutro, sin today marker ni labels. */}
      <View style={[styles.routeLine, { marginTop: 14 }]}>
        <View style={styles.station}>
          <View style={[styles.emptyBar, { width: 26, height: 12, backgroundColor: ph }]} />
        </View>
        <View style={styles.routeTrack}>
          <View style={styles.routeDashes}>
            {Array.from({ length: 24 }).map((_, i) => (
              <View key={i} style={[styles.routeDash, { backgroundColor: muted }]} />
            ))}
          </View>
        </View>
        <View style={styles.station}>
          <View style={[styles.emptyBar, { width: 26, height: 12, backgroundColor: ph }]} />
        </View>
      </View>

      <View style={styles.montosRow}>
        <View>
          <Text style={[styles.montoLabel, { color: theme.colors.heroMuted2 }]}>
            {t('fijos:hero.alreadyPaid')}
          </Text>
          <Text style={[styles.montoPagado, { color: theme.colors.heroText }]}>—</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.montoLabel, { color: theme.colors.heroMuted2 }]}>
            {t('fijos:hero.stillToPay')}
          </Text>
          <Text style={[styles.montoPendiente, { color: theme.colors.heroMuted }]}>—</Text>
        </View>
      </View>

      {/* Segments placeholder — un track muted continuo, sin pintar. */}
      <View style={[styles.segmentsRow, { backgroundColor: muted, borderRadius: 3 }]} />
      <View style={styles.progressFooter}>
        <View style={[styles.emptyBar, { width: 70, height: 9, backgroundColor: ph }]} />
        <View style={[styles.emptyBar, { width: 80, height: 9, backgroundColor: ph }]} />
      </View>

      <View style={styles.perforation}>
        <View
          style={[styles.perfNotchLeft, { backgroundColor: theme.colors.heroGradient[0] }]}
        />
        <View style={styles.perfDashes}>
          {Array.from({ length: 22 }).map((_, i) => (
            <View key={i} style={[styles.perfDash, { backgroundColor: 'rgba(242,234,211,0.30)' }]} />
          ))}
        </View>
        <View
          style={[styles.perfNotchRight, { backgroundColor: theme.colors.heroGradient[0] }]}
        />
      </View>

      <View style={styles.bottomRow}>
        <View>
          <Text style={[styles.bottomLabel, { color: theme.colors.heroAccent }]}>
            {t('fijos:hero.freeMoney')}
          </Text>
          <Text style={[styles.bottomMonto, { color: theme.colors.heroText }]}>—</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.bottomPctLabel, { color: theme.colors.heroMuted2 }]}>
            {t('fijos:hero.ofYourSalary')}
          </Text>
          <Text style={[styles.bottomPct, { color: theme.colors.heroMuted }]}>—</Text>
          <Text style={[styles.bottomPctSub, { color: theme.colors.heroAccent }]}>
            {t('fijos:hero.goesToFixed')}
          </Text>
        </View>
      </View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  emptyCard: { opacity: 0.86 },
  emptyBar: { borderRadius: 4 },
  // Urgency ring REMOVIDO 2026-05-31 — el pulse del hero por vencidos
  // ahora vive en el badge "X VENCIDOS" del header (ver
  // `urgencyBadgeStyle` en el componente). El ring que envolvía toda
  // la card era invasivo.
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
  celebrateWrap: {
    position: 'relative',
  },
  celebrateGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    backgroundColor: '#A6EF8F',
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
  // progressTrack / progressFill / progressDot styles eliminados —
  // pertenecían a la ProgressBar lineal con pulse que fue reemplazada
  // por PaymentSegments (styles arriba).
  // Payment segments — visual replacement de ProgressBar viejo.
  // Cada segment flex:1 ocupa proporcionalmente su espacio. Gap 3pt
  // entre segments para que se lean como ticks discretos.
  segmentsRow: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
    marginTop: 6,
    marginBottom: 6,
  },
  segment: {
    flex: 1,
    height: '100%',
    borderRadius: 3,
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
