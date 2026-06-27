import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import type { StreakDerived } from '@/features/streaks/use-streak'
import type { StatusTone } from './streak-sheet-tone'

/**
 * CTAs reactivos al status:
 *   • PrimaryStatusCta — "Registrar gasto" / "Empezar la racha hoy"
 *     (mostrado en at_risk + broken)
 *   • MarkNoExpenseCta — "Hoy no tuve gastos" (mostrado solo en at_risk
 *     con intensidad urgent/critical)
 *   • UnmarkNoExpenseCta — "Revertir hoy sin gastos" (mostrado en
 *     active cuando ya se marcó hoy)
 *
 * El orchestrator pasa onPress como callback — esta capa no sabe nada
 * de mutations ni Alerts.
 */

interface PrimaryStatusCtaProps {
  status: StreakDerived['status']
  onClose: () => void
  onPressAddExpense: () => void
}

export function PrimaryStatusCta({
  status,
  onClose,
  onPressAddExpense,
}: PrimaryStatusCtaProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const label =
    status === 'broken'
      ? t('gastos:streakSheet.startStreakToday')
      : t('gastos:streakSheet.registerExpenseNow')
  return (
    <Pressable
      style={[styles.cta, { backgroundColor: theme.colors.text }]}
      onPress={() => {
        void triggerHaptic('success')
        onClose()
        onPressAddExpense()
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.ctaText, { color: theme.colors.creamCard }]}>
        {label}
      </Text>
    </Pressable>
  )
}

interface SecondaryCtaProps {
  tone: StatusTone
  busy: boolean
  iconName: keyof typeof MaterialIcons.glyphMap
  label: string
  busyLabel: string
  accessibilityLabel: string
  onPress: () => void
}

export function SecondaryCta({
  tone,
  busy,
  iconName,
  label,
  busyLabel,
  accessibilityLabel,
  onPress,
}: SecondaryCtaProps) {
  return (
    <Pressable
      style={[
        styles.secondaryCta,
        {
          borderColor: tone.cardBorder,
          backgroundColor: tone.cardBg,
          opacity: busy ? 0.5 : 1,
        },
      ]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <MaterialIcons
        name={iconName}
        size={16}
        color={tone.fg}
        style={styles.secondaryCtaIcon}
      />
      <Text style={[styles.secondaryCtaText, { color: tone.fg }]}>
        {busy ? busyLabel : label}
      </Text>
    </Pressable>
  )
}

export const ctaStackStyle = StyleSheet.create({
  stack: { gap: 10 },
}).stack

const styles = StyleSheet.create({
  cta: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: 15, fontWeight: '800' },
  secondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: 1,
  },
  secondaryCtaIcon: { marginRight: 0 },
  secondaryCtaText: { fontSize: 14, fontWeight: '800' },
})

// Re-exporto el wrapper View para componer el stack consistente —
// no agrega cost, mantiene el patrón del orchestrator simple.
export function CtaStack({ children }: { children: React.ReactNode }) {
  return <View style={ctaStackStyle}>{children}</View>
}
