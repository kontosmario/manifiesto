import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
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

const INTENT_LABEL: Record<IntentKind, string> = {
  cancel: 'va a dar de baja',
  pause: 'va a pausar',
  downgrade: 'va a bajar el plan de',
}

function rel(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'hace 1 día'
  return `hace ${days} días`
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
  const cardBg = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  return (
    <View
      style={[styles.card, { backgroundColor: cardBg }]}
      accessibilityRole="summary"
    >
      <Text style={[styles.line, { color: theme.colors.text }]}>
        <Text style={styles.bold}>{declaredByName}</Text> {INTENT_LABEL[intent]}{' '}
        <Text style={styles.bold}>{fijoName}</Text>
      </Text>
      <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
        {rel(declaredAtIso, now)}
      </Text>
      {(intent === 'cancel' || intent === 'pause') && monthlySaving > 0 ? (
        <Text style={[styles.savings, { color: theme.colors.primary }]}>
          Ahorro estimado: ${monthlySaving.toLocaleString('es-AR')} / mes
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
