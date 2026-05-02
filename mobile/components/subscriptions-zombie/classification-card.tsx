import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import type {
  Classification,
  IntentKind,
} from '@/features/subscriptions-zombie/types'

interface Props {
  classification: Classification
  fijoName: string
  fijoAmount: number
  monthsObserved: number
  onDeclareIntent: (intent: IntentKind) => void
  onIgnore: () => void
}

export function ClassificationCard({
  classification,
  fijoName,
  fijoAmount,
  monthsObserved,
  onDeclareIntent,
  onIgnore,
}: Props) {
  if (classification === 'uso_desigual') {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{fijoName}</Text>
        <Text style={styles.body}>
          La usa solo una persona del grupo. ¿Es lo que esperaban?
        </Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sí, está bien"
            style={({ pressed }) => [
              styles.btnSecondary,
              pressed && styles.btnPressed,
            ]}
            onPress={onIgnore}
          >
            <Text style={styles.btnSecondaryText}>Sí, está bien</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (classification !== 'zombie_consensuado') return null

  const total = fijoAmount * Math.max(monthsObserved, 1)

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{fijoName}</Text>
      <Text style={styles.body}>
        La familia casi no la usa.{'\n'}En {monthsObserved} mes
        {monthsObserved === 1 ? '' : 'es'} fueron $
        {total.toLocaleString('es-AR')}.
      </Text>
      <Text style={styles.q}>¿Qué hacen?</Text>
      <View style={styles.actionsCol}>
        <ActionButton
          label="Voy a cancelarla"
          variant="primary"
          onPress={() => {
            void Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Warning,
            )
            onDeclareIntent('cancel')
          }}
        />
        <ActionButton
          label="Voy a pausarla"
          onPress={() => onDeclareIntent('pause')}
        />
        <ActionButton
          label="Voy a bajar el plan"
          onPress={() => onDeclareIntent('downgrade')}
        />
        <ActionButton label="Sigo bancándola" variant="ghost" onPress={onIgnore} />
      </View>
    </View>
  )
}

interface ActionButtonProps {
  label: string
  variant?: 'primary' | 'secondary' | 'ghost'
  onPress: () => void
}

function ActionButton({ label, variant = 'secondary', onPress }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btnBase,
        variant === 'primary' && styles.btnPrimary,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'ghost' && styles.btnGhost,
        pressed && styles.btnPressed,
      ]}
    >
      <Text
        style={
          variant === 'primary'
            ? styles.btnPrimaryText
            : variant === 'ghost'
              ? styles.btnGhostText
              : styles.btnSecondaryText
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF5EE',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#2A1F1A' },
  body: { fontSize: 14, color: '#3A2F26', lineHeight: 20 },
  q: { fontSize: 15, fontWeight: '600', color: '#2A1F1A', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionsCol: { flexDirection: 'column', gap: 8, marginTop: 4 },
  btnBase: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnPrimary: { backgroundColor: '#2E7D5B' },
  btnPrimaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  btnSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8D2C7',
  },
  btnSecondaryText: { color: '#2A1F1A', fontWeight: '600', fontSize: 14 },
  btnGhost: { backgroundColor: 'transparent' },
  btnGhostText: { color: '#6B5E55', fontWeight: '500', fontSize: 13 },
  btnPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
})
