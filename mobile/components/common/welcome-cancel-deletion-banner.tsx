// Sprint J · Audit #3 J-Auth2 — sibling of CancelDeletionBanner for the
// pre-auth screens (welcome / login). Reads from the SecureStore-backed
// last-user cache so we can warn the user about the pending deletion
// BEFORE they sign back in. The CTA bounces to login so they can
// authenticate and then trigger `cancel_account_deletion`.

import { useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
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

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={
        formatted
          ? `Tu cuenta se eliminará el ${formatted}. Iniciá sesión para cancelar.`
          : 'Hay una baja de cuenta agendada. Iniciá sesión para cancelar.'
      }
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
          <Text style={styles.title}>Baja de cuenta agendada</Text>
          <Text style={styles.body}>
            {formatted
              ? `Tu cuenta se eliminará el ${formatted}.`
              : 'Hay una baja agendada para tu cuenta.'}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Iniciar sesión para cancelar la baja"
        onPress={() => router.push(loginHref as never)}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: theme.colors.danger, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.ctaLabel}>Iniciar sesión para cancelar</Text>
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
