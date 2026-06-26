import { useMemo } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { getCaptchaBootError } from '@/lib/captcha-config'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Sprint I · I-6 — surfaces `getCaptchaBootError()` to the UI.
 *
 * `captcha-config.ts` already logs a high-severity error on module load
 * when a non-dev build ships without HCAPTCHA_SITE_KEY, but until this
 * banner nothing read the in-app message. A QA / dogfood tester running
 * an EAS preview build had no in-app signal that signup + reset password
 * were unprotected.
 *
 * The banner is intentionally subtle: a 1-line bar pinned to the top
 * safe-area inset, colored `danger`. It does NOT cover screen content
 * and does NOT block input — it only sits above the Stack so the message
 * is visible from any route. In dev/local builds (the typical case) it
 * never mounts because `getCaptchaBootError()` returns null.
 */
export function CaptchaBootErrorBanner() {
  // Memoise once — the error value is fixed at module-load time.
  const message = useMemo(() => getCaptchaBootError(), [])
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  if (!message) return null

  return (
    <View
      pointerEvents="none"
      style={[
        styles.shell,
        {
          paddingTop: insets.top + 6,
          backgroundColor: theme.colors.danger,
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel={message}
    >
      <Text style={styles.text} numberOfLines={2}>
        {t('states:captchaBanner.message')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 8,
    // Below the auth-transition overlay (z=50) so the splash always
    // covers it during navigations, above everything else.
    zIndex: 40,
    ...(Platform.OS === 'web' ? { position: 'fixed' as 'absolute' } : null),
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
})
