import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/theme/theme-provider'
import type { UsageLevel } from '@/features/subscriptions-zombie/types'

interface Props {
  onSelect: (level: UsageLevel) => void
  disabled?: boolean
}

const OPTIONS: Array<{ level: UsageLevel; labelKey: string }> = [
  { level: 'mucho', labelKey: 'insights:subscriptions.levelButtons.mucho' },
  { level: 'a_veces', labelKey: 'insights:subscriptions.levelButtons.aVeces' },
  { level: 'casi_nunca', labelKey: 'insights:subscriptions.levelButtons.casiNunca' },
]

export function UsageLevelButtons({ onSelect, disabled = false }: Props) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {OPTIONS.map((opt) => {
        const label = t(opt.labelKey)
        return (
          <Pressable
            key={opt.level}
            accessibilityRole="button"
            accessibilityLabel={label}
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
              {label}
            </Text>
          </Pressable>
        )
      })}
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
