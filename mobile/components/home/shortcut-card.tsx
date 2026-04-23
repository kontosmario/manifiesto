import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'

interface ShortcutCardProps {
  label: string
  value: string
  sub: string
  trend?: string
  trendColor?: string
  chart?: React.ReactNode
  delay?: number
  onPress?: () => void
  accessibilityLabel?: string
}

export function ShortcutCard({ label, value, sub, trend, trendColor, chart, delay = 0, onPress, accessibilityLabel }: ShortcutCardProps) {
  const { theme } = useAppTheme()
  return (
    <RiseView delay={delay} style={styles.flex}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line, opacity: pressed ? 0.92 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
      >
        <View style={styles.header}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
          <Svg width={12} height={12} viewBox="0 0 24 24">
            <Path d="M9 6l6 6-6 6" stroke={theme.colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.4} />
          </Svg>
        </View>
        <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
        <Text style={[styles.sub, { color: theme.colors.textSoft }]}>{sub}</Text>
        <View style={styles.footer}>
          {trend ? <Text style={[styles.trend, { color: trendColor ?? theme.colors.text }]}>{trend}</Text> : <View />}
          {chart ? <View>{chart}</View> : null}
        </View>
      </Pressable>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: 18, padding: 14, borderWidth: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  label: { fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  value: { fontSize: 22, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
  sub: { fontSize: 11, marginTop: 1 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 },
  trend: { fontSize: 10.5, fontWeight: '700' },
})
