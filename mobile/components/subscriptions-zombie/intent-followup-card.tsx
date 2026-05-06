import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
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
    <View style={styles.card}>
      <Text style={styles.title}>{titleByKind[followUpKind]}</Text>
      <Text style={styles.ask}>{askByKind[followUpKind]}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sí, ya está"
          style={({ pressed }) => [styles.btnPrimary, pressed && styles.btnPressed]}
          onPress={onConfirmDone}
        >
          <Text style={styles.btnPrimaryText}>Sí, ya está</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Todavía no"
          style={({ pressed }) => [styles.btnSecondary, pressed && styles.btnPressed]}
          onPress={onStillNo}
        >
          <Text style={styles.btnSecondaryText}>Todavía no</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cambié de idea"
        style={({ pressed }) => [styles.btnGhost, pressed && styles.btnPressed]}
        onPress={onChangedMind}
      >
        <Text style={styles.btnGhostText}>Cambié de idea</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF5EE',
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  title: { fontSize: 15, fontWeight: '700', color: '#2A1F1A' },
  ask: { fontSize: 14, color: '#3A2F26', marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  btnPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#2E7D5B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  btnSecondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8D2C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: { color: '#2A1F1A', fontWeight: '600', fontSize: 14 },
  btnGhost: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  btnGhostText: { color: '#6B5E55', fontSize: 13 },
  btnPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
})
