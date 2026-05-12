import { useEffect, useMemo } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { currencyFormatter, formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'

interface CycleWrappedModalProps {
  /** Payload del ciclo cerrado. `null` mantiene el modal oculto. */
  payload: CycleWrappedPayload | null
  onDismiss: () => void
}

/**
 * "Manifiesto Wrapped" — modal full-screen post-cobro que recapitula
 * el ciclo recién cerrado.
 *
 * Pattern: AchievementUnlockModal (mismo scrim + card spring-in), pero
 * con contenido más denso (varios stats stacked) y dismiss explícito
 * (no auto-dismiss — el user quiere leer).
 *
 * Tono: factual + restrained. Si ahorraste se celebra; si te
 * excediste, se dice como dato, sin shame. Coincide con el lenguaje
 * existente del cobro flow ("Cobré el sueldo completo" en peach, no
 * en rojo).
 */
export function CycleWrappedModal({ payload, onDismiss }: CycleWrappedModalProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()

  // Master entrance driver: scrim fade + card spring.
  const t = useSharedValue(0)

  useEffect(() => {
    if (!payload) return
    void triggerHaptic('success')
    if (reduced) {
      t.value = 1
      return
    }
    t.value = 0
    t.value = withTiming(1, {
      duration: 460,
      easing: Easing.bezier(0.16, 1, 0.30, 1),
    })
  }, [payload, reduced, t])

  const scrimStyle = useAnimatedStyle(() => ({ opacity: t.value }))
  const cardStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [
      { translateY: (1 - t.value) * 28 },
      { scale: 0.96 + t.value * 0.04 },
    ],
  }))

  // Confetti solo cuando hay algo para celebrar (ahorraste).
  const confettiPulse = useMemo(() => {
    if (!payload) return 0
    return payload.savingsDelta > 0 ? 1 : 0
  }, [payload])

  // Delta vs ciclo anterior — leve mejora si gastaste menos. Hook
  // declarado antes del early return para mantener orden estable.
  const deltaCopy = useMemo(
    () => formatDeltaCopy(payload?.deltaVsPreviousPercent ?? null),
    [payload?.deltaVsPreviousPercent],
  )

  if (!payload) return null

  const savedPositive = payload.savingsDelta > 0
  const overspent = payload.savingsDelta < 0

  // Tono del hero — verde si ahorraste, peach si excediste, neutral
  // si cerraste empatado.
  const heroTone = savedPositive
    ? {
        eyebrow: 'CERRASTE CON MARGEN',
        color: theme.colors.primaryStrong,
        bgTint: theme.colors.primarySurface,
      }
    : overspent
    ? {
        eyebrow: 'CERRASTE EXCEDIDO',
        color: '#C25A3E',
        bgTint: 'rgba(232,151,106,0.16)',
      }
    : {
        eyebrow: 'CERRASTE EMPATADO',
        color: theme.colors.text,
        bgTint: theme.colors.surfaceMuted,
      }

  // Texto principal del hero.
  const heroAmount = Math.abs(payload.savingsDelta)
  const heroLabel = savedPositive
    ? 'te quedaron libres'
    : overspent
    ? 'te excediste'
    : 'cerraste justo'

  return (
    <Animated.View
      pointerEvents={payload ? 'auto' : 'none'}
      style={[styles.scrim, scrimStyle]}
    >
      {/* Backdrop tap → dismiss */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar resumen del ciclo"
        onPress={onDismiss}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: theme.colors.line,
          },
          cardStyle,
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollBody}
          // Prevent the backdrop press from swallowing scroll gestures.
          // The pressable behind the card is absolute-positioned at the
          // scrim level; this ensures swipes inside the card scroll.
        >
          {/* ── Header: eyebrow + period label ──────────────── */}
          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
              MANIFIESTO · CIERRE DE CICLO
            </Text>
            <Text style={[styles.periodLabel, { color: theme.colors.text }]}>
              {payload.periodLabel}
            </Text>
            {payload.periodRange ? (
              <Text style={[styles.periodRange, { color: theme.colors.textSoft }]}>
                {payload.periodRange}
              </Text>
            ) : null}
          </View>

          {/* ── Hero: savings delta ─────────────────────────── */}
          <View
            style={[
              styles.hero,
              {
                backgroundColor: heroTone.bgTint,
                borderColor: theme.colors.line,
              },
            ]}
          >
            <Text style={[styles.heroEyebrow, { color: heroTone.color }]}>
              {heroTone.eyebrow}
            </Text>
            <CountUpText
              value={heroAmount}
              duration={1500}
              format={(n) => formatMoney(Math.round(n))}
              style={[styles.heroAmount, { color: heroTone.color }]}
            />
            <Text style={[styles.heroLabel, { color: theme.colors.textMuted }]}>
              {heroLabel}
            </Text>
          </View>

          {/* ── Stat strip: total spent · count · delta vs prev ─ */}
          <View style={styles.statStrip}>
            <StatCell
              label="Gastaste"
              value={formatMoney(Math.round(payload.totalSpent))}
              hint={`de ${formatMoney(Math.round(payload.monthlyIncome))} ingresados`}
            />
            <Divider color={theme.colors.line} />
            <StatCell
              label="Movimientos"
              value={String(payload.expensesCount)}
              hint={
                payload.expensesCount === 1 ? 'gasto registrado' : 'gastos registrados'
              }
            />
            {deltaCopy ? (
              <>
                <Divider color={theme.colors.line} />
                <StatCell
                  label="Vs ciclo anterior"
                  value={deltaCopy.value}
                  hint={deltaCopy.hint}
                  valueColor={deltaCopy.color === 'good'
                    ? theme.colors.primaryStrong
                    : deltaCopy.color === 'bad'
                    ? '#C25A3E'
                    : theme.colors.text}
                />
              </>
            ) : null}
          </View>

          {/* ── Top categoría ───────────────────────────────── */}
          {payload.topCategory ? (
            <View
              style={[
                styles.detailCard,
                { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.line },
              ]}
            >
              <View style={styles.detailHeader}>
                <Text style={[styles.detailEyebrow, { color: theme.colors.textMuted }]}>
                  TOP CATEGORÍA
                </Text>
                <Text style={[styles.detailShare, { color: theme.colors.textSoft }]}>
                  {Math.round(payload.topCategory.share * 100)}% del total
                </Text>
              </View>
              <Text style={[styles.detailTitle, { color: theme.colors.text }]} numberOfLines={1}>
                {payload.topCategory.name}
              </Text>
              <Text style={[styles.detailAmount, { color: theme.colors.primaryStrong }]}>
                {formatMoney(Math.round(payload.topCategory.amount))}
              </Text>
              {/* Share bar — visualiza el % del total que se fue a esta cat */}
              <View style={[styles.bar, { backgroundColor: theme.colors.line }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${Math.max(6, Math.round(payload.topCategory.share * 100))}%`,
                      backgroundColor: theme.colors.primary,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {/* ── Top expense ─────────────────────────────────── */}
          {payload.topExpense ? (
            <View
              style={[
                styles.detailCard,
                { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.line },
              ]}
            >
              <Text style={[styles.detailEyebrow, { color: theme.colors.textMuted }]}>
                EL GASTO MÁS GRANDE
              </Text>
              <Text style={[styles.detailTitle, { color: theme.colors.text }]} numberOfLines={2}>
                {payload.topExpense.description || 'Sin descripción'}
              </Text>
              <Text style={[styles.detailAmount, { color: theme.colors.text }]}>
                {currencyFormatter.format(payload.topExpense.price)}
              </Text>
              <Text style={[styles.detailHint, { color: theme.colors.textSoft }]}>
                {formatDayMonth(payload.topExpense.occurredAt)}
              </Text>
            </View>
          ) : null}

          {/* ── Achievements ganados en el ciclo ────────────── */}
          {payload.achievementsEarnedInCycle > 0 ? (
            <View
              style={[
                styles.achievementsPill,
                {
                  backgroundColor: theme.colors.primarySurface,
                  borderColor: theme.colors.primary,
                },
              ]}
            >
              <MaterialIcons
                name="emoji-events"
                size={18}
                color={theme.colors.primaryStrong}
              />
              <Text
                style={[
                  styles.achievementsText,
                  { color: theme.colors.primaryStrong },
                ]}
              >
                {payload.achievementsEarnedInCycle === 1
                  ? '1 logro desbloqueado este ciclo'
                  : `${payload.achievementsEarnedInCycle} logros desbloqueados este ciclo`}
              </Text>
            </View>
          ) : null}

          {/* ── CTA ─────────────────────────────────────────── */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Empezar el próximo ciclo"
            onPress={() => {
              void triggerHaptic('selection')
              onDismiss()
            }}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: theme.colors.primary,
                opacity: pressed ? 0.86 : 1,
              },
            ]}
          >
            <Text style={styles.ctaText}>Empezar el próximo</Text>
          </Pressable>
        </ScrollView>

        {/* Confetti solo en cierres positivos. originY apunta al hero. */}
        <ConfettiBurst pulseToken={confettiPulse} originY={200} />
      </Animated.View>
    </Animated.View>
  )
}

// ── Subcomponents ───────────────────────────────────────────────

function StatCell({
  label,
  value,
  hint,
  valueColor,
}: {
  label: string
  value: string
  hint: string
  valueColor?: string
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.statValue,
          { color: valueColor ?? theme.colors.text },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text
        style={[styles.statHint, { color: theme.colors.textSoft }]}
        numberOfLines={1}
      >
        {hint}
      </Text>
    </View>
  )
}

function Divider({ color }: { color: string }) {
  return <View style={[styles.divider, { backgroundColor: color }]} />
}

// ── Helpers ─────────────────────────────────────────────────────

/** Format del delta vs ciclo anterior. Negativo = gastaste menos =
 *  "good". Positivo = gastaste más = "bad". Si null, no mostramos. */
function formatDeltaCopy(
  deltaPct: number | null,
): { value: string; hint: string; color: 'good' | 'bad' | 'neutral' } | null {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return null
  const rounded = Math.round(deltaPct)
  if (rounded === 0) {
    return { value: '=', hint: 'igual que el anterior', color: 'neutral' }
  }
  if (rounded < 0) {
    return {
      value: `${rounded}%`,
      hint: 'menos que el anterior',
      color: 'good',
    }
  }
  return {
    value: `+${rounded}%`,
    hint: 'más que el anterior',
    color: 'bad',
  }
}

/** "15 mar" en español, sin año porque ya está en el header. */
function formatDayMonth(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return ''
  const day = Number(match[3])
  const month = Number(match[2])
  const MES = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ]
  return `${day} ${MES[month - 1]}`
}

// ── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8, 34, 26, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    paddingHorizontal: 18,
    paddingVertical: 32,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '92%',
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.35,
    shadowRadius: 40,
    elevation: 20,
  },
  scrollBody: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    gap: 18,
  },
  header: {
    alignItems: 'center',
    gap: 4,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  periodLabel: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  periodRange: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  hero: {
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  heroAmount: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1.1,
    fontVariant: ['tabular-nums'],
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  statStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 12,
    gap: 6,
  },
  statCell: {
    flex: 1,
    paddingHorizontal: 4,
    gap: 4,
    alignItems: 'flex-start',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statHint: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  detailCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  detailShare: {
    fontSize: 11,
    fontWeight: '600',
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  detailAmount: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  detailHint: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  bar: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 6,
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
  achievementsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  achievementsText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
    flex: 1,
  },
  cta: {
    marginTop: 6,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#FFFBF2',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
})
