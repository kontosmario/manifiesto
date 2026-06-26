import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/theme/theme-provider'
import type { AuditFeedItem } from '@/features/subscriptions-zombie/types'

interface Props {
  fijoName: string
  declaredAtIso: string
  followUpKind: NonNullable<AuditFeedItem['followUpKind']>
  onConfirmDone: () => void
  onStillNo: () => void
  onChangedMind: () => void
  now: Date
}

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000)
}

export function IntentFollowupCard({
  fijoName,
  declaredAtIso,
  followUpKind,
  onConfirmDone,
  onStillNo,
  onChangedMind,
  now,
}: Props) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const cardBg = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  const titleByKind: Record<typeof followUpKind, string> = {
    payment_recurred: t('insights:subscriptions.followup.titlePaymentRecurred', {
      name: fijoName,
    }),
    no_payment_after_due: t('insights:subscriptions.followup.titleNoPayment', {
      name: fijoName,
    }),
    awaiting_post_due: t('insights:subscriptions.followup.titleAwaiting', {
      count: daysSince(declaredAtIso, now),
      name: fijoName,
    }),
  }

  const askByKind: Record<typeof followUpKind, string> = {
    payment_recurred: t('insights:subscriptions.followup.askPaymentRecurred'),
    no_payment_after_due: t('insights:subscriptions.followup.askNoPayment'),
    awaiting_post_due: t('insights:subscriptions.followup.askAwaiting'),
  }

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>
        {titleByKind[followUpKind]}
      </Text>
      <Text style={[styles.ask, { color: theme.colors.textMuted }]}>
        {askByKind[followUpKind]}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('insights:subscriptions.followup.confirmDone')}
          style={({ pressed }) => [
            styles.btnPrimary,
            { backgroundColor: theme.colors.primary },
            pressed && styles.btnPressed,
          ]}
          onPress={onConfirmDone}
        >
          <Text style={[styles.btnPrimaryText, { color: theme.colors.textOnPrimary }]}>
            {t('insights:subscriptions.followup.confirmDone')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('insights:subscriptions.followup.stillNo')}
          style={({ pressed }) => [
            styles.btnSecondary,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.line,
            },
            pressed && styles.btnPressed,
          ]}
          onPress={onStillNo}
        >
          <Text style={[styles.btnSecondaryText, { color: theme.colors.text }]}>
            {t('insights:subscriptions.followup.stillNo')}
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('insights:subscriptions.followup.changedMind')}
        style={({ pressed }) => [styles.btnGhost, pressed && styles.btnPressed]}
        onPress={onChangedMind}
      >
        <Text style={[styles.btnGhostText, { color: theme.colors.textMuted }]}>
          {t('insights:subscriptions.followup.changedMind')}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  title: { fontSize: 15, fontWeight: '700' },
  ask: { fontSize: 14, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  btnPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { fontWeight: '700', fontSize: 14 },
  btnSecondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: { fontWeight: '600', fontSize: 14 },
  btnGhost: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  btnGhostText: { fontSize: 13 },
  btnPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
})
