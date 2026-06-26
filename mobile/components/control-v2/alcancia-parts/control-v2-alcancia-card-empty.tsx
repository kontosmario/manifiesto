import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { RiseView } from '@/components/home/animated/rise-view'
import { CreateSavingsGoalWizardSheet } from '@/components/savings-goals/create-savings-goal-wizard-sheet'
import { usePressScale } from '@/hooks/use-press-scale'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { ReserveBlock } from './reserve-block'

// Mismo umbral que el card principal — vale en este file para que el
// callout muestre el progreso ("Gasto en X de Y días") sin necesidad
// de prop drilling extra. Si se actualiza aquí, también actualizar en
// `control-v2-alcancia-card.tsx`.
const MIN_SPEND_DAYS = 3

interface ControlV2AlcanciaCardEmptyProps {
  diasConGasto: number
  familyId: string
  userId?: string
  goal: SavingsGoal | null
  monthlyReserveAmount: number
}

/**
 * Empty-state twin de "Tu alcancía". Misma chrome (surface, border
 * `line`, eyebrow + BreatheDot + título UPPERCASE) y la misma silueta —
 * número grande + 3 mini-tiles + CTA — pero inerte: el número como dash
 * muted, tiles con valores en dash, CTA con look deshabilitado (no
 * presionable). El pill dice "Pronto" en textMuted; el callout comunica
 * la activación + el progreso. Recesado (opacity 0.86), sin shimmer.
 *
 * Reserva acumulada: vive FUERA del paywall de "días con gasto".
 * Si el user tiene plata en reserva, debe poder administrarla
 * independiente de que la sugerencia de vault aún no esté lista.
 * El ReserveBlock se auto-renderea nullable.
 */
export function ControlV2AlcanciaCardEmpty({
  diasConGasto,
  familyId,
  userId,
  goal,
  monthlyReserveAmount,
}: ControlV2AlcanciaCardEmptyProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const isDark = theme.isDark
  const ph = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,42,30,0.06)'
  const tileBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,42,30,0.04)'
  const tileBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,42,30,0.08)'
  const muted = theme.colors.textMuted
  const text = theme.colors.text
  const cardBg = isDark ? theme.colors.surfaceMuted : theme.colors.creamCard
  const progreso = Math.max(0, Math.min(diasConGasto, MIN_SPEND_DAYS))

  // Crear meta NO depende de días con gasto (a diferencia del vault). Cuando no
  // hay meta, el candado "Disponible pronto" es engañoso (no existe una meta a
  // la que mover) → ofrecemos crearla aquí mismo con el wizard self-contained.
  const [wizardOpen, setWizardOpen] = useState(false)
  const ctaPress = usePressScale({ pressedScale: 0.97 })
  const accentFg = theme.colors.success
  const createBg = isDark ? 'rgba(122,216,163,0.18)' : 'rgba(28,126,58,0.10)'
  const createBorder = isDark ? 'rgba(122,216,163,0.42)' : 'rgba(28,126,58,0.30)'
  const handleCreatePress = () => {
    void triggerHaptic('selection')
    setWizardOpen(true)
  }

  return (
    <RiseView delay={180}>
      <View
        accessibilityRole="text"
        accessibilityLabel={t('control:alcancia.empty.a11y')}
        style={[
          styles.card,
          styles.emptyCard,
          { backgroundColor: cardBg, borderColor: theme.colors.line },
        ]}
      >
        <View style={styles.eyebrowRow}>
          <BreatheDot size={7} color={muted} glow={muted} />
          <Text style={[styles.eyebrow, { color: muted }]} numberOfLines={1}>
            {t('control:alcancia.eyebrow')}
          </Text>
          <View style={[styles.emptyPill, { borderColor: theme.colors.line }]}>
            <Text style={[styles.emptyPillText, { color: muted }]}>{t('control:alcancia.empty.soon')}</Text>
          </View>
        </View>

        {/* Número grande inerte como dash muted + glyph recesado. */}
        <View style={styles.heroRow}>
          <View style={styles.heroFlex}>
            <View style={styles.amountRow}>
              <Text style={[styles.amount, { color: muted }]}>—</Text>
            </View>
            <View
              style={[styles.emptyBar, { width: '70%', height: 10, backgroundColor: ph, marginTop: 8 }]}
            />
          </View>
          <View style={[styles.glyph, { backgroundColor: ph }]}>
            <MaterialIcons name="savings" size={28} color={muted} />
          </View>
        </View>

        {/* Sin meta → CTA FUNCIONAL para crearla (no necesita días con gasto).
            Con meta pero pocos días → el vault sí está pendiente: candado. */}
        {goal == null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('control:alcancia.empty.ctaCrearA11y')}
            onPress={handleCreatePress}
            onPressIn={ctaPress.onPressIn}
            onPressOut={ctaPress.onPressOut}
          >
            <Animated.View
              style={[
                styles.cta,
                ctaPress.animatedStyle,
                { backgroundColor: createBg, borderColor: createBorder },
              ]}
            >
              <MaterialIcons name="add" size={16} color={accentFg} />
              <Text style={[styles.ctaText, { color: accentFg }]} numberOfLines={1}>
                {t('control:alcancia.empty.ctaCrear')}
              </Text>
              <MaterialIcons name="chevron-right" size={18} color={accentFg} />
            </Animated.View>
          </Pressable>
        ) : (
          <View
            style={[styles.cta, { backgroundColor: tileBg, borderColor: tileBorder }]}
          >
            <MaterialIcons name="lock-outline" size={16} color={muted} />
            <Text style={[styles.ctaText, { color: muted }]} numberOfLines={1}>
              {t('control:alcancia.empty.disponiblePronto')}
            </Text>
          </View>
        )}

        {/* 3 mini-tiles inertes — labels reales, valores en dash. */}
        <View style={styles.tilesRow}>
          {(
            [
              ['sinGastos', t('control:alcancia.empty.tileSinGastos')],
              ['bajoCupo', t('control:alcancia.empty.tileBajoCupo')],
              ['racha', t('control:alcancia.empty.tileRacha')],
            ] as const
          ).map(([key, label]) => (
            <View
              key={key}
              style={[styles.tile, { backgroundColor: tileBg, borderColor: tileBorder }]}
            >
              <View style={styles.tileHead}>
                <View style={[styles.emptyDot, { backgroundColor: ph }]} />
                <Text style={[styles.tileLabel, { color: muted }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
              <Text style={[styles.tileValue, { color: muted }]}>—</Text>
              <View
                style={[styles.emptyBar, { width: 40, height: 7, backgroundColor: ph, marginTop: 5 }]}
              />
            </View>
          ))}
        </View>

        <View
          style={[
            styles.emptyCallout,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,42,30,0.04)',
              borderColor: theme.colors.line,
            },
          ]}
        >
          <MaterialIcons name="schedule" size={16} color={muted} />
          <View style={styles.calloutBody}>
            <Text style={[styles.emptyCalloutText, { color: text }]}>
              {t('control:alcancia.empty.callout', { days: MIN_SPEND_DAYS })}
            </Text>
            <Text style={[styles.emptyProgress, { color: muted }]}>
              {t('control:alcancia.empty.progress', {
                progress: progreso,
                days: MIN_SPEND_DAYS,
              })}
            </Text>
          </View>
        </View>

        {/* Reserva acumulada: vive FUERA del paywall de "días con gasto".
            Si el user tiene plata en reserva, debe poder administrarla
            independiente de que la sugerencia de vault aún no esté
            lista. El ReserveBlock se auto-renderea nullable. */}
        <ReserveBlock
          familyId={familyId}
          userId={userId}
          monthlyReserveAmount={monthlyReserveAmount}
          goal={goal}
        />

        <CreateSavingsGoalWizardSheet
          visible={wizardOpen}
          familyId={familyId}
          userId={userId}
          onCreated={() => setWizardOpen(false)}
          onClose={() => setWizardOpen(false)}
        />
      </View>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '800',
    flexShrink: 1,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroFlex: { flex: 1 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  amount: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 32,
  },
  glyph: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  ctaText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tile: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 64,
  },
  tileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  tileLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tileValue: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  // ── Empty-state silhouette ──────────────────────────────────
  emptyCard: { opacity: 0.86 },
  emptyBar: { borderRadius: 4 },
  emptyDot: { width: 8, height: 8, borderRadius: 4 },
  emptyPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  emptyPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  emptyCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  calloutBody: { flex: 1, gap: 4 },
  emptyCalloutText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  emptyProgress: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
})
