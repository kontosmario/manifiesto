// Form field wrapper: eyebrow label + children. Extraído de
// `add-fijo-v2-screen.tsx` para uniformar los labels del wizard.
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useFijosSkin } from '@/components/fijos/fijos-skin'
import { useAppTheme } from '@/theme/theme-provider'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  return (
    <View>
      <Text
        style={[
          styles.eyebrow,
          { color: theme.colors.textMuted, marginBottom: 6 },
          neo ? { ...neo.add.sectionLabel, color: neo.add.sectionLabelInk, marginBottom: 8 } : null,
        ]}
      >
        {label}
      </Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
})
