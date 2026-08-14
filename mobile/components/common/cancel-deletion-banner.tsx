// Sprint J · Audit #3 J-Auth2 — Cancel pending account deletion.
//
// `request_account_deletion` schedules a soft-delete with a 30-day grace
// window. Before this banner the only path back into the account was a
// future "cancel" CTA that lived in a TODO comment. An attacker who got
// a foothold (resumed Supabase session via stolen device, or a one-off
// email link) could schedule the victim's deletion and the victim had
// no in-app surface to recover.
//
// The fix is forceful by design: a non-dismissible banner on home and
// settings that surfaces the scheduled date and a single CTA wired to
// `cancel_account_deletion`. It cannot be dismissed without acting —
// users cannot accidentally swipe it away and forget.
//
// A sibling banner (`welcome-cancel-deletion-banner`) reads the same
// information from the SecureStore-backed last-user cache so the user
// sees the warning BEFORE signing back in.

import { useCallback, useMemo } from 'react'
import { Alert, Platform, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { NeoButton } from '@/components/ui/neo-button'
import i18n from '@/lib/i18n'
import { useCancelAccountDeletion } from '@/features/auth/use-delete-account'
import { triggerHaptic } from '@/lib/haptics'
import { neoInk } from '@/theme/neo-ink'
import { neoMaterial, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { useThemeMode } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'
import { monthShort } from '@/utils/date-format'
import { getErrorMessage, isRateLimitError } from '@/utils/error-message'

interface CancelDeletionBannerProps {
  userId: string
  scheduledAt: string | null | undefined
}

function formatScheduledDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day = d.getDate()
  const month = monthShort(d)
  const year = d.getFullYear()
  return i18n.t('states:accountDeletion.dateFormat', { day, month, year })
}

export function CancelDeletionBanner({
  userId,
  scheduledAt,
}: CancelDeletionBannerProps) {
  const mode = useThemeMode().resolvedMode
  const neo = neoTokens(mode)
  const ink = neoInk(mode)
  const { t } = useTranslation()
  const cancelDeletion = useCancelAccountDeletion(userId)

  const formatted = useMemo(
    () => (scheduledAt ? formatScheduledDate(scheduledAt) : null),
    [scheduledAt],
  )

  const handleCancel = useCallback(() => {
    if (cancelDeletion.isPending) return
    void triggerHaptic('selection')
    cancelDeletion.mutate(undefined, {
      onSuccess: () => {
        void triggerHaptic('success')
      },
      onError: (error) => {
        void triggerHaptic('error')
        // Sprint L · Audit #5 L-Med2 — rate-limit explicit UX.
        // `cancel_account_deletion` is capped at 5/hour (Sprint H · H3).
        // A panicked user fat-fingering the button hits the cap and
        // the generic Postgres error reads like "the cancel failed",
        // which is exactly the wrong message — the deletion is still
        // pending and they CAN still cancel later. We detect the rate
        // limit explicitly and reassure the user.
        const rateLimited = isRateLimitError(error)
        Alert.alert(
          rateLimited
            ? t('states:accountDeletion.rateLimitTitle')
            : t('states:accountDeletion.failTitle'),
          rateLimited
            ? t('states:accountDeletion.rateLimitBody')
            : getErrorMessage(
                error,
                t('states:accountDeletion.failBody'),
              ),
        )
      },
    })
  }, [cancelDeletion])

  if (!scheduledAt) return null

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={
        formatted
          ? t('states:accountDeletion.a11yDated', { date: formatted })
          : t('states:accountDeletion.a11yUndated')
      }
      style={[styles.shell, neoMaterial(mode, 'raisedMd'), { borderColor: ink.danger }]}
    >
      <View style={styles.row}>
        <MaterialIcons color={ink.danger} name="warning-amber" size={24} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: neo.text }]}>
            {t('states:accountDeletion.title')}
          </Text>
          <Text style={[styles.body, { color: neo.textMuted }]}>
            {formatted
              ? t('states:accountDeletion.bodyDated', { date: formatted })
              : t('states:accountDeletion.bodyUndated')}
          </Text>
        </View>
      </View>
      <NeoButton
        disabled={cancelDeletion.isPending}
        fullWidth
        label={
          cancelDeletion.isPending
            ? t('states:accountDeletion.cancelling')
            : t('states:accountDeletion.cancel')
        }
        loading={cancelDeletion.isPending}
        onPress={handleCancel}
        variant="danger"
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
    ...(Platform.OS === 'web' ? {} : { marginHorizontal: 0 }),
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: nunitoFamily('400'),
    lineHeight: 18,
  },
})
