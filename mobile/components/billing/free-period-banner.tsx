import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { MaterialIcons } from '@expo/vector-icons'
import { freeAccessBadgeLabel } from '@/features/billing/free-access-nudge'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

/**
 * Banner informativo del período libre (estado de cuenta — NUNCA "prueba" ni
 * "gratis"; ver compliance del spec §7). Vive arriba del paywall y comunica
 * que el acceso sigue completo. Paleta CALMA alineada con Settings (superficie
 * `primarySurface` + borde estándar); el gradiente forest + luciérnagas quedan
 * reservados para el hero de membresía y los tiles del plan.
 */
export interface FreePeriodBannerProps {
  daysLeft: number
}

export const FreePeriodBanner = memo(function FreePeriodBanner({
  daysLeft,
}: FreePeriodBannerProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: theme.colors.primarySurface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: theme.colors.creamCard }]}>
        <MaterialIcons name="lock-open" size={16} color={theme.colors.primary} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {t('billing:freePeriodBanner.title')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          {freeAccessBadgeLabel(daysLeft)}
        </Text>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: { flex: 1 },
  title: { fontSize: 12, fontWeight: '800', fontFamily: nunitoFamily('800') },
  subtitle: { fontSize: 10, fontWeight: '600', fontFamily: nunitoFamily('600'), marginTop: 1 },
})
