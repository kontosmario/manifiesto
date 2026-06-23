import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { FernMark } from '@/components/billing/fern-mark'
import { useAppTheme } from '@/theme/theme-provider'
import type { WeekClose } from '@/features/garden/garden-model'

interface WeekCloseBannerProps {
  weekClose: WeekClose
  onPress: () => void
}

/**
 * Banner en la pantalla Mi jardín que refleja el resultado de la semana.
 * Semana perfecta (7/7) → fondo/borde/chip verdes; si no, neutro.
 */
function WeekCloseBannerImpl({ weekClose, onPress }: WeekCloseBannerProps) {
  const { theme } = useAppTheme()
  const perfect = weekClose.score >= 7
  const isDark = theme.isDark

  const bg = perfect
    ? isDark
      ? 'rgba(166,239,143,0.12)'
      : '#E7F1DE'
    : isDark
      ? theme.colors.surfaceMuted
      : theme.colors.creamCard
  const border = perfect
    ? isDark
      ? 'rgba(166,239,143,0.26)'
      : '#C9E3BB'
    : theme.colors.line
  const chipBg = perfect ? '#2E7D31' : isDark ? 'rgba(255,255,255,0.08)' : theme.colors.creamSoft
  const chipColor = perfect ? '#FFFFFF' : theme.colors.textMuted

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Cierre de semana: ${weekClose.label}, ${weekClose.score} de 7 días`}
      style={[styles.banner, { backgroundColor: bg, borderColor: border }]}
    >
      <View style={[styles.iconTile, { backgroundColor: isDark ? 'rgba(166,239,143,0.16)' : '#FFFFFF' }]}>
        <FernMark variant={isDark ? 'mint' : 'forest'} size={25} />
      </View>
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{weekClose.label}</Text>
        <Text style={[styles.sub, { color: theme.colors.textSoft }]}>
          {weekClose.score}/7 días registrados
        </Text>
      </View>
      <Text style={[styles.chip, { backgroundColor: chipBg, color: chipColor }]}>Ver cierre ›</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
  },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  sub: {
    fontSize: 12.5,
    marginTop: 1,
  },
  chip: {
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: 'hidden',
  },
})

export const WeekCloseBanner = memo(WeekCloseBannerImpl)
