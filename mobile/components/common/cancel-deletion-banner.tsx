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
import { Alert, Platform, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { useCancelAccountDeletion } from '@/features/auth/use-delete-account'
import { triggerHaptic } from '@/lib/haptics'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { MONTH_SHORT } from '@/utils/date-format'
import { getErrorMessage } from '@/utils/error-message'

interface CancelDeletionBannerProps {
  userId: string
  scheduledAt: string | null | undefined
}

function formatScheduledDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day = d.getDate()
  const month = MONTH_SHORT[d.getMonth()]
  const year = d.getFullYear()
  return `${day} de ${month}. ${year}`
}

export function CancelDeletionBanner({
  userId,
  scheduledAt,
}: CancelDeletionBannerProps) {
  const { theme } = useAppTheme()
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
        Alert.alert(
          'No pudimos cancelar la baja',
          getErrorMessage(
            error,
            'Probá nuevamente en un momento. Si el problema persiste, escribinos a soporte@manifiestoapp.com.',
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
          ? `Tu cuenta se eliminará el ${formatted}. Tocá para cancelar.`
          : 'Tu cuenta tiene una baja agendada. Tocá para cancelar.'
      }
      style={[
        styles.shell,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.danger,
        },
      ]}
    >
      <View style={styles.row}>
        <MaterialIcons
          color={theme.colors.danger}
          name="warning-amber"
          size={24}
        />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Baja de cuenta agendada
          </Text>
          <Text style={[styles.body, { color: theme.colors.textMuted }]}>
            {formatted
              ? `Tu cuenta se eliminará el ${formatted}. Cancelá si no fuiste vos.`
              : 'Tu cuenta tiene una baja agendada. Cancelá si no fuiste vos.'}
          </Text>
        </View>
      </View>
      <AppButton
        disabled={cancelDeletion.isPending}
        label={cancelDeletion.isPending ? 'Cancelando…' : 'Cancelar eliminación'}
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
    borderRadius: radii.lg,
    padding: 14,
    gap: 12,
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
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
})
