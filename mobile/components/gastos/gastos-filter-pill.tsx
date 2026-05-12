import { useEffect, useMemo } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  interpolateColor,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { motionDurations, motionEasings } from '@/lib/motion/tokens'
import { darkenForLightBg } from '@/utils/category-color'
import { useAppTheme } from '@/theme/theme-provider'

interface GastosFilterPillProps {
  active: boolean
  label: string
  count?: number
  emoji?: string
  color?: string
  small?: boolean
  onPress?: () => void
}

/** Rounded pill used in the category filter row + bottom sheet. */
export function GastosFilterPill({
  active,
  label,
  count,
  emoji,
  color,
  small = false,
  onPress,
}: GastosFilterPillProps) {
  const { theme } = useAppTheme()

  // ── Active/inactive transition ──────────────────────────────────
  // Driven by a single shared value: 0 = inactive, 1 = active. We
  // interpolate background, border, label colour and the inner count
  // chip together so the whole pill morphs in lockstep instead of the
  // colours snapping at the moment of tap. ~220ms feels tactile but
  // not sluggish; matches the duration we use for hero LinearTransition.
  const activity = useSharedValue(active ? 1 : 0)
  useEffect(() => {
    activity.value = withTiming(active ? 1 : 0, {
      duration: motionDurations.standard,
      easing: motionEasings.decelerate,
    })
    return () => cancelAnimation(activity)
  }, [active, activity])

  // ── Press feedback ──────────────────────────────────────────────
  // Subtle scale on press so the user gets immediate tactile feedback
  // before the filter actually applies.
  const press = useSharedValue(1)

  const inactiveBg = theme.colors.creamCard
  const activeBg = theme.colors.text
  const inactiveBorder = theme.colors.line
  const activeBorder = theme.colors.text
  const inactiveFg = theme.colors.text
  const activeFg = theme.colors.creamCard
  const inactiveCountBg = theme.colors.pageBg
  // Active count chip bg: cream-alpha en light (queda gris sobre text bg
  // → contrast OK con cream fg), forest-alpha en dark (queda cream sobre
  // text bg cream → contrast con forest fg). Antes era hardcoded
  // `rgba(255,255,255,0.18)` que en dark dejaba el chip casi-blanco con
  // lime invisible.
  const activeCountBg = theme.isDark
    ? 'rgba(15,46,31,0.18)'
    : 'rgba(255,255,255,0.18)'
  // Inactive count fg: el category color pastel sobre pageBg-light
  // (#F4FDF2 faint mint) caía a ~1.5:1 — ilegible. Para light usamos
  // la variante oscura hue-preserved del category color (L=22 HSL),
  // que da ≥5:1 sobre pageBg. Para dark, el pastel original sobre
  // pageBg #12211A ya da 8-10:1 ✅, no necesita ajuste.
  // Fallback: si no hay color, usar `text` (alto contraste ambos modos).
  const resolvedInactiveCountFg = useMemo(() => {
    if (!color) return theme.colors.text
    return theme.isDark ? color : darkenForLightBg(color)
  }, [color, theme.isDark, theme.colors.text])
  const inactiveCountFg = resolvedInactiveCountFg
  // Active count fg: antes era `heroAccent` (lime) — en dark, sobre el
  // chip bg que queda casi-cream, daba 1.16:1 invisible. Switch a
  // `activeFg` (creamCard) para que el count "eche un eco" del label
  // color → contraste alto en ambos modos:
  //   - light: creamCard #FFFBF2 sobre chip-bg (dark-grey-green) ≥6:1
  //   - dark: creamCard #305A47 sobre chip-bg (near-cream) ≥6:1
  const activeCountFg = activeFg

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      activity.value,
      [0, 1],
      [inactiveBg, activeBg],
    ),
    borderColor: interpolateColor(
      activity.value,
      [0, 1],
      [inactiveBorder, activeBorder],
    ),
    transform: [{ scale: press.value }],
  }))

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      activity.value,
      [0, 1],
      [inactiveFg, activeFg],
    ),
  }))

  const countBgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      activity.value,
      [0, 1],
      [inactiveCountBg, activeCountBg],
    ),
  }))

  const countFgStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      activity.value,
      [0, 1],
      [inactiveCountFg, activeCountFg],
    ),
  }))

  return (
    <Animated.View
      // LinearTransition handles width changes when the count badge
      // mounts/unmounts so the pill doesn't jump.
      layout={LinearTransition.duration(220)}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          press.value = withTiming(0.96, {
            duration: motionDurations.micro,
            easing: Easing.out(Easing.quad),
          })
        }}
        onPressOut={() => {
          // @motion-allow: press release de 200ms entre micro (120) y standard (240) para snap-back ágil
          press.value = withTiming(1, {
            duration: 200,
            easing: Easing.out(Easing.quad),
          })
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={
          count != null
            ? `${label}, ${count} ${count === 1 ? 'movimiento' : 'movimientos'}${active ? ', filtro activo' : ''}`
            : `${label}${active ? ', filtro activo' : ''}`
        }
        accessibilityHint={
          active ? 'Doble tap para quitar el filtro' : 'Doble tap para filtrar por esta categoría'
        }
      >
        <Animated.View
          style={[
            styles.pill,
            {
              paddingHorizontal: small ? 10 : 12,
              paddingVertical: small ? 6 : 8,
            },
            pillStyle,
            // Active state shadow theme-aware. Antes era hardcoded
            // `rgba(15,42,30,0.4)` (forest dark con alpha) — funcionaba
            // sobre canvas light pero en dark canvas (#12211A) la sombra
            // era invisible (dark sobre dark). En dark usamos una lift
            // tonal con cream-alpha que crea halo sutil arriba del pill.
            active
              ? {
                  boxShadow: theme.isDark
                    ? '0px 6px 16px -6px rgba(166,239,143,0.32)'
                    : '0px 6px 16px -6px rgba(15,42,30,0.4)',
                }
              : null,
          ]}
        >
          {emoji ? <Text style={{ fontSize: small ? 12 : 14 }}>{emoji}</Text> : null}
          <Animated.Text style={[styles.label, { fontSize: small ? 11 : 12 }, labelStyle]}>
            {label}
          </Animated.Text>
          {count != null ? (
            <Animated.View style={[styles.count, countBgStyle]}>
              <Animated.Text style={[styles.countText, countFgStyle]}>
                {count}
              </Animated.Text>
            </Animated.View>
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: { fontWeight: '700' },
  count: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  countText: { fontSize: 10, fontWeight: '700' },
})
