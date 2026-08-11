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
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { NeoButton } from '@/components/ui/neo-button'
import i18n from '@/lib/i18n'
import { getLastUserProfile } from '@/lib/last-user-cache'
import { neoInk } from '@/theme/neo-ink'
import { neoMaterial, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { useThemeMode } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'
import { monthShort } from '@/utils/date-format'

interface WelcomeCancelDeletionBannerProps {
  /** Optional: where the CTA routes the user. Defaults to the login flow. */
  loginHref?: string
}

function formatScheduledDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day = d.getDate()
  const month = monthShort(d)
  const year = d.getFullYear()
  return i18n.t('states:accountDeletion.dateFormat', { day, month, year })
}

export function WelcomeCancelDeletionBanner({
  loginHref = '/(auth)/login',
}: WelcomeCancelDeletionBannerProps) {
  const router = useRouter()
  const mode = useThemeMode().resolvedMode
  const neo = neoTokens(mode)
  const ink = neoInk(mode)
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
      style={[styles.shell, neoMaterial(mode, 'raisedMd'), { borderColor: ink.danger }]}
    >
      <View style={styles.row}>
        <MaterialIcons color={ink.danger} name="warning-amber" size={22} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: neo.text }]}>
            {t('states:welcomeAccountDeletion.title')}
          </Text>
          <Text style={[styles.body, { color: neo.textMuted }]}>
            {formatted
              ? t('states:welcomeAccountDeletion.bodyDated', { date: formatted })
              : t('states:welcomeAccountDeletion.bodyUndated')}
          </Text>
          <Text style={[styles.hint, { color: neo.textMuted }]}>
            {t('states:welcomeAccountDeletion.hint')}
          </Text>
        </View>
      </View>
      <NeoButton
        accessibilityLabel={t('states:welcomeAccountDeletion.ctaA11y')}
        fullWidth
        label={t('states:welcomeAccountDeletion.cta')}
        onPress={() => router.push(loginHref as never)}
        variant="ghost"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 2,
    borderRadius: neoRadii.cardSm,
    padding: 16,
    gap: 14,
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
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: nunitoFamily('400'),
    lineHeight: 17,
  },
  hint: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
    lineHeight: 15,
  },
})
