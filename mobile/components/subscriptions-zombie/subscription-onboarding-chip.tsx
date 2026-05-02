import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'

interface Props {
  onMark: () => void
}

export function SubscriptionOnboardingChip({ onMark }: Props) {
  return (
    <View style={styles.chip}>
      <View style={styles.textWrap}>
        <Text style={styles.text}>¿Es una suscripción?</Text>
        <Text style={styles.subtext}>Marcala para auditar su uso.</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Marcar como suscripción"
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        onPress={() => {
          void Haptics.selectionAsync()
          onMark()
        }}
      >
        <Text style={styles.btnText}>Marcar</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F7F3ED',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  textWrap: { flex: 1 },
  text: { fontSize: 13, fontWeight: '600', color: '#2A1F1A' },
  subtext: { fontSize: 12, color: '#6B5E55', marginTop: 2 },
  btn: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#2E7D5B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
})
