import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
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
  const cardBg = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  const titleByKind: Record<typeof followUpKind, string> = {
    payment_recurred: `${fijoName} se volvió a cobrar.`,
    no_payment_after_due: `${fijoName} no se cobró este mes.`,
    awaiting_post_due: `Hace ${daysSince(declaredAtIso, now)} días ibas a dar de baja ${fijoName}.`,
  }

  const askByKind: Record<typeof followUpKind, string> = {
    payment_recurred: '¿Pasó algo?',
    no_payment_after_due: '¿Confirmas que la diste de baja?',
    awaiting_post_due: '¿Pudiste?',
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
          accessibilityLabel="Sí, ya está"
          style={({ pressed }) => [
            styles.btnPrimary,
            { backgroundColor: theme.colors.primary },
            pressed && styles.btnPressed,
          ]}
          onPress={onConfirmDone}
        >
          <Text style={[styles.btnPrimaryText, { color: theme.colors.textOnPrimary }]}>
            Sí, ya está
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Todavía no"
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
            Todavía no
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cambié de idea"
        style={({ pressed }) => [styles.btnGhost, pressed && styles.btnPressed]}
        onPress={onChangedMind}
      >
        <Text style={[styles.btnGhostText, { color: theme.colors.textMuted }]}>
          Cambié de idea
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
