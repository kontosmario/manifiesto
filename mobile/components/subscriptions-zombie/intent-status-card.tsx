import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useAppTheme } from '@/theme/theme-provider'
import type { IntentKind } from '@/features/subscriptions-zombie/types'

interface Props {
  intent: IntentKind
  declaredByName: string
  declaredAtIso: string
  fijoName: string
  monthlySaving: number
  now: Date
}

const INTENT_LABEL_KEY: Record<IntentKind, string> = {
  cancel: 'insights:subscriptions.status.intentCancel',
  pause: 'insights:subscriptions.status.intentPause',
  downgrade: 'insights:subscriptions.status.intentDowngrade',
}

function rel(iso: string, now: Date, t: TFunction): string {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000)
  if (days === 0) return t('insights:subscriptions.status.today')
  return t('insights:subscriptions.status.rel', { count: days })
}

export function IntentStatusCard({
  intent,
  declaredByName,
  declaredAtIso,
  fijoName,
  monthlySaving,
  now,
}: Props) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const cardBg = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  return (
    <View
      style={[styles.card, { backgroundColor: cardBg }]}
      accessibilityRole="summary"
    >
      <Text style={[styles.line, { color: theme.colors.text }]}>
        <Text style={styles.bold}>{declaredByName}</Text> {t(INTENT_LABEL_KEY[intent])}{' '}
        <Text style={styles.bold}>{fijoName}</Text>
      </Text>
      <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
        {rel(declaredAtIso, now, t)}
      </Text>
      {(intent === 'cancel' || intent === 'pause') && monthlySaving > 0 ? (
        <Text style={[styles.savings, { color: theme.colors.primary }]}>
          {t('insights:subscriptions.status.savings', {
            amount: `$${monthlySaving.toLocaleString('es-AR')}`,
          })}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  line: { fontSize: 14 },
  bold: { fontWeight: '700' },
  meta: { fontSize: 12 },
  savings: { fontSize: 13, fontWeight: '600', marginTop: 4 },
})
