import { memo, useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { FloatView } from '@/components/home/animated/float-view'
import { RiseView } from '@/components/home/animated/rise-view'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { QuickAddSavingsSheet } from '@/components/home/quick-add-savings-sheet'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import { useAddSavingsContribution } from '@/features/savings-goals/use-add-savings-contribution'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoneyShort } from '@/utils/money'

interface MetaCardProps {
  goal: SavingsGoal
  /** Surface the inline "+ Agregar ahorro" action and the contribution
   *  sheet. Disabled in the savings-goal config preview where there's
   *  no real id to write against. */
  enableQuickAdd?: boolean
  /** Sets the slider's "100%" reference inside the quick-add sheet.
   *  Home passes the user's monthly savings target (`family_finance.
   *  savings_goal`) so the slider reads "X% del ahorro mensual";
   *  Control passes the cycle's underspent vault. When omitted the
   *  sheet falls back to "lo que falta" del goal. */
  suggestedAmount?: number
}

const ACCENT_GRADIENT: readonly [string, string, ...string[]] = ['#6FE09A', '#F2B58A']

/**
 * Meta (savings goal) card.
 *
 * Cream surface + success-tinted accent border for identity. The
 * horizontal progress bar carries the savings progression — users
 * recognised and liked the linear "% complete" reading, so it's the
 * focal data viz of the card. Nothing else on the home screen uses
 * the same green→peach gradient bar, so this stays the visual
 * signature of "tu meta" without leaning on hero chrome.
 *
 * Left-edge decorations were intentionally removed (both the alcancía
 * jar and the slim gradient stripe) — they competed with the bar
 * and didn't carry information already provided by the chip + bar.
 *
 * The card body is purely informational — only the "Agregar ahorro"
 * pill is interactive. Tapping the card itself is a no-op so users
 * don't accidentally drift away from the home screen while reading
 * progress; navigation to the goal config still lives in Settings.
 */
function MetaCardImpl({
  goal,
  enableQuickAdd = false,
  suggestedAmount,
}: MetaCardProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const isDark = theme.isDark

  const pct = Math.min(100, Math.round((goal.currentAmount / goal.goalAmount) * 100))
  const remaining = Math.max(0, goal.goalAmount - goal.currentAmount)
  const isComplete = pct >= 100 && goal.currentAmount > 0

  const accentFg = theme.colors.success
  const accentBorder = isDark ? 'rgba(122,216,163,0.42)' : 'rgba(28,126,58,0.32)'
  const accentChipBg = isDark ? 'rgba(122,216,163,0.16)' : 'rgba(28,126,58,0.10)'
  const accentChipBorder = isDark ? 'rgba(122,216,163,0.34)' : 'rgba(28,126,58,0.26)'
  const trackBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,42,30,0.08)'
  const actionBg = isDark ? 'rgba(122,216,163,0.20)' : 'rgba(28,126,58,0.12)'
  const actionBorder = isDark ? 'rgba(122,216,163,0.42)' : 'rgba(28,126,58,0.30)'

  // Horizontal progress fill — same animation curve users got used to.
  const fillScaleX = useSharedValue(reduced ? pct / 100 : 0)
  useEffect(() => {
    if (reduced) {
      fillScaleX.value = pct / 100
      return
    }
    fillScaleX.value = withDelay(
      500,
      withTiming(pct / 100, {
        duration: 1300,
        easing: Easing.bezier(0.2, 0.9, 0.2, 1),
      }),
    )
  }, [pct, reduced, fillScaleX])
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: fillScaleX.value }],
  }))

  // Quick-add wiring.
  const [sheetOpen, setSheetOpen] = useState(false)
  const addMutation = useAddSavingsContribution(goal.familyId)
  const handleQuickAddPress = () => {
    if (!enableQuickAdd) return
    void triggerHaptic('selection')
    setSheetOpen(true)
  }
  const handleSheetSubmit = (amount: number) => {
    addMutation.mutate(
      { goalId: goal.id, amount },
      {
        onSuccess: () => {
          void triggerHaptic('success')
          setSheetOpen(false)
        },
        onError: (err) => {
          void triggerHaptic('error')
          Alert.alert(
            'No pudimos sumar el aporte',
            err instanceof Error ? err.message : 'Reintentá en un momento.',
          )
        },
      },
    )
  }

  const chipLabel = isComplete
    ? '¡Completa!'
    : goal.targetMonths != null
      ? `${pct}% · ~${goal.targetMonths} ${goal.targetMonths === 1 ? 'mes' : 'meses'}`
      : `${pct}% logrado`

  return (
    <RiseView delay={300}>
      <View
        accessibilityLabel={
          isComplete
            ? `Tu meta ${goal.title} está completa`
            : `Tu meta ${goal.title}: ${pct} por ciento logrado, faltan ${formatMoneyShort(remaining)}`
        }
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: accentBorder,
          },
        ]}
      >
          <RiseView>
            <View style={styles.labelRow}>
              <View style={styles.labelLeft}>
                <BreatheDot size={7} color={accentFg} glow={accentFg} />
                <Text
                  numberOfLines={1}
                  style={[styles.label, { color: accentFg }]}
                >
                  TU META · {goal.title.toUpperCase()}
                </Text>
              </View>
              <View
                style={[
                  styles.pctChip,
                  {
                    backgroundColor: accentChipBg,
                    borderColor: accentChipBorder,
                  },
                ]}
              >
                <Text style={[styles.pctChipText, { color: accentFg }]}>
                  {chipLabel}
                </Text>
              </View>
            </View>
          </RiseView>

          <RiseView delay={80}>
            <View style={styles.amountRow}>
              <View style={styles.amountFlex}>
                <CountUpText
                  value={goal.currentAmount}
                  format={(n) => formatMoneyShort(n)}
                  style={[styles.amount, { color: theme.colors.text }]}
                />
                <Text style={[styles.goalText, { color: theme.colors.textMuted }]}>
                  Objetivo · {formatMoneyShort(goal.goalAmount)}
                </Text>
              </View>
              <FloatView amplitude={4} periodMs={3000}>
                <Text style={styles.emoji}>{goal.emoji}</Text>
              </FloatView>
            </View>
          </RiseView>

          <RiseView delay={140}>
            <View style={[styles.barWrap, { backgroundColor: trackBg }]}>
              <Animated.View
                style={[
                  styles.barInner,
                  { transformOrigin: 'left' as const },
                  fillStyle,
                ]}
              >
                <LinearGradient
                  colors={ACCENT_GRADIENT}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
              <ShineOverlay
                width={280}
                height={8}
                tint={isDark ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.55)'}
                delayMs={1800}
                periodMs={3400}
              />
            </View>
          </RiseView>

          <RiseView delay={200}>
            <View style={styles.footerRow}>
              {isComplete ? (
                <Text
                  style={[styles.footerText, { color: accentFg, flex: 1 }]}
                  numberOfLines={1}
                >
                  <Text style={styles.footerStrong}>¡Lo lograste!</Text> Disfrutá tu meta.
                </Text>
              ) : (
                <Text
                  style={[styles.footerText, { color: theme.colors.textMuted }]}
                  numberOfLines={1}
                >
                  Faltan{' '}
                  <Text style={[styles.footerStrong, { color: theme.colors.text }]}>
                    {formatMoneyShort(remaining)}
                  </Text>
                </Text>
              )}

              {enableQuickAdd && !isComplete ? (
                <Pressable
                  onPress={handleQuickAddPress}
                  accessibilityRole="button"
                  accessibilityLabel="Agregar ahorro a esta meta"
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.actionPill,
                    {
                      backgroundColor: actionBg,
                      borderColor: actionBorder,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <MaterialIcons name="savings" size={14} color={accentFg} />
                  <Text style={[styles.actionPillText, { color: accentFg }]}>
                    Agregar ahorro
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </RiseView>
        </View>

      {enableQuickAdd ? (
        <QuickAddSavingsSheet
          visible={sheetOpen}
          goalTitle={goal.title}
          remaining={remaining}
          isSaving={addMutation.isPending}
          initialAmount={
            suggestedAmount && suggestedAmount > 0 ? suggestedAmount : undefined
          }
          onClose={() => {
            if (addMutation.isPending) return
            setSheetOpen(false)
          }}
          onSubmit={handleSheetSubmit}
        />
      ) : null}
    </RiseView>
  )
}

export const MetaCard = memo(MetaCardImpl)

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  labelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  pctChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  pctChipText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
    marginBottom: 10,
  },
  amountFlex: { flex: 1 },
  amount: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 28,
  },
  goalText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  emoji: { fontSize: 30 },
  barWrap: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  barInner: { height: '100%', width: '100%' },
  footerRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '500',
  },
  footerStrong: {
    fontWeight: '800',
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
})
