// Pill CTA del empty-state del feed de Gastos. Extraída del JSX inline
// de `gastos-v2-screen.tsx` porque `usePressScale` necesita component
// body (rules of hooks). Spring scale 0.97 (Emil-grade), texto en
// `primaryStrong` para AA limpio en ambos modos.
import { Pressable, StyleSheet } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated from 'react-native-reanimated'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

export function EmptyActionButton({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  const { theme } = useAppTheme()
  const press = usePressScale({ pressedScale: 0.97 })
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Animated.View
        style={[
          styles.emptyAction,
          {
            backgroundColor: theme.colors.primarySurface,
            borderColor: theme.colors.line,
          },
          press.animatedStyle,
        ]}
      >
        {/* `primaryStrong` en lugar de `primary` para AA cleanly en
            ambos modos. En light primaryStrong #1F590D es más oscuro
            que primary (7.7:1 vs 5.2:1 sobre primarySurface). En dark
            primaryStrong #D1F7C5 es más brillante que primary #A6EF8F
            (5.1:1 vs 4.4:1 marginal). Switch single-token AA win. */}
        <Text style={[styles.emptyActionText, { color: theme.colors.primaryStrong }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  emptyAction: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyActionText: { fontSize: 12, fontWeight: '700', fontFamily: nunitoFamily('700') },
})
