// Sprint J · Audit #3 J-Auth2 — sibling of CancelDeletionBanner for the
// pre-auth screens (welcome / login). Reads from the SecureStore-backed
// last-user cache so we can warn the user about the pending deletion
// BEFORE they sign back in. The CTA bounces to login so they can
// authenticate and then trigger `cancel_account_deletion`.
//
// Sprint L · Audit #5 L-4 (2026-06-10):
//   The SecureStore cache is per-device. If the user cancels their
//   pending deletion on device 2, device 1 keeps showing the banner
//   indefinitely because we never refresh `deletionScheduledAt` while
//   the device is signed out (we have no JWT to query profiles).
//
//   We can't fix the data-staleness at this layer — only an
//   authenticated round-trip can confirm the field. What we CAN do is
//   change the messaging from a forceful "tu cuenta SE ELIMINARÁ el X"
//   to a soft "TENÍAS una baja agendada · inicia sesión para verificar
//   el estado". That removes the false urgency for the user who
//   already cancelled elsewhere, while still nudging the user who
//   really does have a pending deletion to log in. After login,
//   `useLastUserProfileSync` refreshes the field; if the deletion was
//   cancelled, the banner stops showing on next mount.

import { useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { getLastUserProfile } from '@/lib/last-user-cache'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { MONTH_SHORT } from '@/utils/date-format'

interface WelcomeCancelDeletionBannerProps {
  /** Optional: where the CTA routes the user. Defaults to the login flow. */
  loginHref?: string
}

function formatScheduledDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day = d.getDate()
  const month = MONTH_SHORT[d.getMonth()]
  const year = d.getFullYear()
  return `${day} de ${month}. ${year}`
}

export function WelcomeCancelDeletionBanner({
  loginHref = '/(auth)/login',
}: WelcomeCancelDeletionBannerProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const [scheduledAt, setScheduledAt] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getLastUserProfile().then((profile) => {
      if (cancelled) return
      setScheduledAt(profile?.deletionScheduledAt ?? null)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const formatted = useMemo(
    () => (scheduledAt ? formatScheduledDate(scheduledAt) : null),
    [scheduledAt],
  )

  if (!loaded || !scheduledAt) return null

  // L-4: soft tone. We deliberately say "tenías" (past tense) and
  // "verificar el estado" instead of the authenticated banner's
  // forceful "tu cuenta se eliminará". The cache may be out of date
  // because the user cancelled on another device — we don't want to
  // panic them, just route them to login where the server-side
  // refresh will resolve it.
  const accessibilityMessage = formatted
    ? t('states:welcomeAccountDeletion.a11yDated', { date: formatted })
    : t('states:welcomeAccountDeletion.a11yUndated')

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={accessibilityMessage}
      style={[
        styles.shell,
        {
          backgroundColor: 'rgba(0,0,0,0.55)',
          borderColor: theme.colors.danger,
        },
      ]}
    >
      <View style={styles.row}>
        <MaterialIcons color={theme.colors.danger} name="warning-amber" size={22} />
        <View style={styles.copy}>
          <Text style={styles.title}>{t('states:welcomeAccountDeletion.title')}</Text>
          <Text style={styles.body}>
            {formatted
              ? t('states:welcomeAccountDeletion.bodyDated', { date: formatted })
              : t('states:welcomeAccountDeletion.bodyUndated')}
          </Text>
          <Text style={styles.hint}>
            {t('states:welcomeAccountDeletion.hint')}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('states:welcomeAccountDeletion.ctaA11y')}
        onPress={() => router.push(loginHref as never)}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: theme.colors.danger, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.ctaLabel}>{t('states:welcomeAccountDeletion.cta')}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 2,
    borderRadius: radii.lg,
    padding: 14,
    gap: 12,
    ...(Platform.OS === 'web' ? {} : {}),
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: '#FFFBF2',
  },
  body: {
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,251,242,0.78)',
  },
  hint: {
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,251,242,0.6)',
    fontStyle: 'italic',
  },
  cta: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: '#FFFBF2',
  },
})
