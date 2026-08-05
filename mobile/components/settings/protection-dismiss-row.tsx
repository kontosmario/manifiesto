// Sprint R-3 redesign (2026-06-11) — "Recordame mañana" inline link
// shown under the "Acceso rápido" settings group when the user has no
// biometric and no PIN configured. Replaces the prior sticky home
// banner's "Después" button. Tone: low-affordance text link (not a
// button), so the dominant CTA stays on the actual setup rows above.
//
// Tap → dismisses the protection prompt for 24h (the gear-icon dot on
// home disappears, the contextual footer in this group reverts to its
// default informational copy).

import { Pressable, StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { neoTokens } from '@/theme/neo-tokens'

interface ProtectionDismissRowProps {
  onPress: () => void
}

export function SettingsProtectionDismissRow({ onPress }: ProtectionDismissRowProps) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const { t } = useTranslation()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('settings:protectionDismiss.a11y')}
      hitSlop={8}
      onPress={() => {
        void triggerHaptic('selection')
        onPress()
      }}
      style={styles.row}
    >
      <Text style={[styles.label, { color: neo.textMuted }]}>
        {t('settings:protectionDismiss.label')}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    alignSelf: 'flex-end',
    paddingTop: 6,
    paddingBottom: 2,
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
})
