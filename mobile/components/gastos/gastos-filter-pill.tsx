import { memo, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { AnimatedText, Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
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
import { useGatedLayout } from '@/hooks/use-layout-transition-gate'
import { darkenForLightBg } from '@/utils/category-color'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

interface GastosFilterPillProps {
  active: boolean
  label: string
  count?: number
  /** Emoji string (back-compat) renderizado en un `<Text>` a la izquierda
   *  del label. Si se pasa `iconNode`, este se ignora. */
  emoji?: string
  /** Ícono ya construido (p.ej. `<CategoryIcon>` que rendea el sticker PNG
   *  con fallback al emoji). Tiene prioridad sobre `emoji`. */
  iconNode?: ReactNode
  color?: string
  small?: boolean
  /**
   * Argumento que `onSelect` recibe cuando se presiona la pill.
   * Para "Todas" usar `null`, para categoría específica usar su `id`.
   * Tener el arg como prop (no en una arrow inline en el parent) es lo
   * que permite que `React.memo` funcione — sin esto, cada render del
   * SmartFilter creaba una new `onPress` arrow per pill, rompiendo el
   * shallow compare.
   */
  selectId?: string | null
  onSelect?: (id: string | null) => void
}

/** Rounded pill used in the category filter row + bottom sheet. */
function GastosFilterPillImpl({
  active,
  label,
  count,
  emoji,
  iconNode,
  color,
  small = false,
  selectId = null,
  onSelect,
}: GastosFilterPillProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const pillLayout = useGatedLayout(LinearTransition.duration(220))
  // Estabilidad: useCallback baked sobre selectId (primitivo string|null)
  // + onSelect (stable useCallback'd upstream). Reemplaza la arrow
  // inline del parent que rompía el memo.
  const handlePress = useCallback(() => {
    onSelect?.(selectId)
  }, [onSelect, selectId])

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

  // Dark mode: inactive pills match the muted card surface
  // (surfaceMuted) so they sit in the same family as the near-black
  // canvas instead of the brighter creamCard. Shared with Fijos tabs —
  // both screens get the consistent treatment. `activeFg` below stays
  // creamCard (it's the label color on the active dark pill).
  const inactiveBg = theme.isDark
    ? theme.colors.surfaceMuted
    : theme.colors.creamCard
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
      // mounts/unmounts so the pill doesn't jump. Gateado en el primer
      // attach del tab para no warpear cuando el data warm se asienta.
      layout={pillLayout}
    >
      <Pressable
        onPress={handlePress}
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
            ? t('gastos:filterPill.a11yWithCount', {
                label,
                count,
                context: active ? 'active' : undefined,
              })
            : t('gastos:filterPill.a11yNoCount', {
                label,
                context: active ? 'active' : undefined,
              })
        }
        accessibilityHint={
          active
            ? t('gastos:filterPill.hintRemove')
            : t('gastos:filterPill.hintApply')
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
          {iconNode ?? (emoji ? <Text style={{ fontSize: small ? 12 : 14 }}>{emoji}</Text> : null)}
          <AnimatedText style={[styles.label, { fontSize: small ? 11 : 12 }, labelStyle]}>
            {label}
          </AnimatedText>
          {count != null ? (
            <Animated.View style={[styles.count, countBgStyle]}>
              <AnimatedText style={[styles.countText, countFgStyle]}>
                {count}
              </AnimatedText>
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
  label: { fontWeight: '700', fontFamily: nunitoFamily('700') },
  count: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  countText: { fontSize: 10, fontWeight: '700', fontFamily: nunitoFamily('700') },
})

/**
 * Memo wrap. GastosFilterPill se renderea N veces en el filter row
 * (una por categoría con expenses). Sin memo, cualquier change del
 * parent (selectedCategoryId toggle, count update) re-rendereaba TODAS
 * las pills con sus interpolateColor animations re-running.
 *
 * Props son primitives + un onPress callback (debe ser useCallback'd
 * upstream — verificado en `gastos-smart-filter.tsx`). Shallow compare
 * exacto.
 */
export const GastosFilterPill = memo(GastosFilterPillImpl)
