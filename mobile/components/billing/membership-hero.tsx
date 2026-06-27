import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { getStateTokens, type SemanticState } from '@/theme/state-tokens'
import { useAppTheme } from '@/theme/theme-provider'
import type { MembershipVariant } from '@/features/billing/membership-state'

/**
 * Hero de "Mi suscripción". Misma superficie que el card "TU HOGAR" de Ajustes
 * (`surfaceMuted` en oscuro / `creamCard` en claro + borde `line`), para que el
 * panel de planes pertenezca a la misma paleta que Settings. El estado lo refleja
 * el pill (`getStateTokens` según `tone`) y el `heroLine` matiza la nuance
 * (renovación / grace / cortesía / miembro cubierto).
 */
export interface MembershipHeroProps {
  planName: string
  variant: MembershipVariant
}

/** tone del entitlement → estado semántico del pill. */
const TONE_TO_STATE: Record<MembershipVariant['tone'], SemanticState> = {
  active: 'positive',
  warn: 'caution',
  comped: 'neutral',
}

export const MembershipHero = memo(function MembershipHero({
  planName,
  variant,
}: MembershipHeroProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const pill = getStateTokens(TONE_TO_STATE[variant.tone], theme)

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[theme.typography.eyebrow, { color: theme.colors.textMuted }]}>
          {t('billing:membershipHero.eyebrow')}
        </Text>
        <View
          style={[styles.pill, { backgroundColor: pill.bg, borderColor: pill.border }]}
        >
          <View style={[styles.pillDot, { backgroundColor: pill.fg }]} />
          <Text style={[styles.pillLabel, { color: pill.fg }]}>
            {variant.statusLabel}
          </Text>
        </View>
      </View>

      <Text style={[styles.planName, { color: theme.colors.text }]}>
        {planName}
      </Text>
      <Text style={[styles.heroLine, { color: theme.colors.textMuted }]}>
        {variant.heroLine}
      </Text>
    </View>
  )
})

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  pillLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  planName: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginTop: 10,
  },
  heroLine: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
})
