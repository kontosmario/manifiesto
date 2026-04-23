import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

interface HeroStatProps {
  label: string
  value: string
  sub: string
  accent?: boolean
}

export function HeroStat({ label, value, sub, accent = false }: HeroStatProps) {
  const { theme } = useAppTheme()
  const labelColor = accent ? theme.colors.heroAccent : theme.colors.heroMuted2
  const valueColor = accent ? theme.colors.heroAccent : theme.colors.heroText
  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: labelColor }]}>{label.toUpperCase()}</Text>
      <Text
        style={[
          styles.value,
          {
            color: valueColor,
            textShadowColor: accent ? theme.colors.heroAccent : 'transparent',
            textShadowRadius: accent ? 12 : 0,
          },
        ]}
      >
        {value}
      </Text>
      <Text style={[styles.sub, { color: theme.colors.heroMuted2 }]}>{sub}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 2, paddingHorizontal: 4, flex: 1 },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  value: { fontSize: 15, fontWeight: '800', letterSpacing: -0.4 },
  sub: { fontSize: 10, fontWeight: '600' },
})
