// Pill "Limpiar filtros" del feed de Gastos. Extraído del JSX inline de
// `gastos-v2-screen.tsx` porque `usePressScale` requiere component body
// (rules of hooks). Press feedback Emil-grade: spring scale 0.97 (mismo
// patrón que Home Sprint 1) — antes era un fade muerto opacity 0.85
// sin sensación de tap.
import { Pressable, StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'

export function ClearFiltersButton({ onPress }: { onPress: () => void }) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const press = usePressScale({ pressedScale: 0.97 })
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={t('gastos:clearFilters.a11yLabel')}
      hitSlop={8}
    >
      <Animated.View
        style={[
          styles.clearFiltersBtn,
          {
            backgroundColor: theme.colors.creamSoft,
            borderColor: theme.colors.line,
          },
          press.animatedStyle,
        ]}
      >
        <MaterialIcons name="filter-alt-off" size={14} color={theme.colors.textMuted} />
        <Text style={[styles.clearFiltersText, { color: theme.colors.textMuted }]}>
          {t('gastos:clearFilters.label')}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  clearFiltersBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  clearFiltersText: {
    fontSize: 12,
    fontWeight: '600',
  },
})
