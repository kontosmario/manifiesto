import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useAppTheme } from '@/theme/theme-provider'
import type { UsageLevel } from '@/features/subscriptions-zombie/types'

interface Props {
  onSelect: (level: UsageLevel) => void
  disabled?: boolean
}

const OPTIONS: Array<{ level: UsageLevel; label: string }> = [
  { level: 'mucho', label: 'La uso mucho' },
  { level: 'a_veces', label: 'A veces' },
  { level: 'casi_nunca', label: 'Casi nunca' },
]

export function UsageLevelButtons({ onSelect, disabled = false }: Props) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {OPTIONS.map((opt) => (
        <Pressable
          key={opt.level}
          accessibilityRole="button"
          accessibilityLabel={opt.label}
          disabled={disabled}
          onPress={() => {
            void Haptics.selectionAsync()
            onSelect(opt.level)
          }}
          style={({ pressed }) => [
            styles.btn,
            {
              borderColor: theme.colors.line,
              backgroundColor: theme.colors.surface,
            },
            pressed && styles.btnPressed,
            disabled && styles.btnDisabled,
          ]}
        >
          <Text style={[styles.btnText, { color: theme.colors.text }]}>
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  btnPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
})
