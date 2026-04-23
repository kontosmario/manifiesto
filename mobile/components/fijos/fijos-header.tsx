import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { RiseView } from '@/components/home/animated/rise-view'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

interface FijosHeaderProps {
  title?: string
  subtitle?: string
  onPressAdd?: () => void
}

export function FijosHeader({
  title = 'Fijos',
  subtitle = 'Todo lo recurrente en un solo lugar',
  onPressAdd,
}: FijosHeaderProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const pulseScale = useSharedValue(1)

  useEffect(() => {
    if (reduced) return
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    )
  }, [reduced, pulseScale])
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }))

  const buttonColors = theme.isDark
    ? (['#C7EE9C', '#8DD66A'] as const)
    : (['#1F7A4B', '#0E3A26'] as const)
  const iconColor = theme.isDark ? '#0A1410' : '#F6FBEF'

  return (
    <RiseView>
      <View style={styles.row}>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
          ) : null}
        </View>
        <Animated.View style={[styles.addButtonWrap, pulseStyle]}>
          <Pressable
            onPress={onPressAdd}
            accessibilityRole="button"
            accessibilityLabel="Agregar fijo"
            style={styles.addButtonPressable}
          >
            <LinearGradient
              colors={[...buttonColors] as unknown as readonly [string, string, ...string[]]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.addButton}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 5v14M5 12h14"
                  stroke={iconColor}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                />
              </Svg>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  titleBlock: { flex: 1 },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -1.2, lineHeight: 34 },
  subtitle: { fontSize: 13, marginTop: 6, lineHeight: 18, maxWidth: 260 },
  addButtonWrap: {
    marginTop: 6,
    marginLeft: 8,
    borderRadius: 999,
    boxShadow: '0px 8px 18px -6px rgba(14, 58, 38, 0.5)',
  },
  addButtonPressable: { borderRadius: 999, overflow: 'hidden' },
  addButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
})
