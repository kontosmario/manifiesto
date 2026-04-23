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
          { color: valueColor },
          accent
            ? // textShadow is the new cross-platform API (RN 0.76+ / RN-web 0.21+)
              // that replaces textShadowColor/Radius. Not yet in TextStyle types.
              ({ textShadow: `0px 0px 12px ${theme.colors.heroAccent}` } as unknown as import('react-native').TextStyle)
            : null,
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
