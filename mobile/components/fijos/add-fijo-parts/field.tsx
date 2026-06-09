// Form field wrapper: eyebrow label + children. Extraído de
// `add-fijo-v2-screen.tsx` para uniformar los labels del wizard.
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const { theme } = useAppTheme()
  return (
    <View>
      <Text style={[styles.eyebrow, { color: theme.colors.textMuted, marginBottom: 6 }]}>
        {label}
      </Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
})
