// Tile de selección de frecuencia. Mismo border-glide pattern que
// `NameInput` / `AmountCard`: focus → grow + tint; warning glide sin
// width change. Extraído de `add-fijo-v2-screen.tsx`.
import { useEffect } from 'react'
import { Image, Pressable, StyleSheet, Text } from 'react-native'
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'
import { useFijosSkin } from '@/components/fijos/fijos-skin'
import { motionDurations } from '@/lib/motion'
import { useAppTheme } from '@/theme/theme-provider'

export interface FreqTileProps {
  icon: string
  label: string
  selected: boolean
  onPress: () => void
  /** Cuando true, el border resting se tinta a `theme.colors.warning`
   *  via un smooth glide. Los selected tiles ignoran el flag — se quedan
   *  en el brand color así el recovery state queda unambiguous. */
  warning?: boolean
}

export function FreqTile({
  icon,
  label,
  selected,
  onPress,
  warning = false,
}: FreqTileProps) {
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const reduceMotion = useReducedMotion()
  const selectedProgress = useSharedValue(selected ? 1 : 0)
  const warningProgress = useSharedValue(warning ? 1 : 0)

  useEffect(() => {
    const target = selected ? 1 : 0
    selectedProgress.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionDurations.standard })
  }, [selected, reduceMotion, selectedProgress])

  useEffect(() => {
    warningProgress.value = reduceMotion
      ? (warning ? 1 : 0)
      : withTiming(warning ? 1 : 0, {
          duration: motionDurations.standard,
          easing: Easing.bezier(0.32, 0.72, 0, 1),
        })
  }, [warning, reduceMotion, warningProgress])

  // Mismo nested-interpolate pattern que los otros shared inputs: width
  // sólo sigue la selected animation así el warning toggle nunca
  // resiza el tile.
  const borderStyle = useAnimatedStyle(() => {
    'worklet'
    const normalColor = interpolateColor(
      selectedProgress.value,
      [0, 1],
      [theme.colors.line, theme.colors.primary],
    )
    const warnColor = interpolateColor(
      selectedProgress.value,
      [0, 1],
      [theme.colors.warning, theme.colors.primary],
    )
    return {
      borderColor: interpolateColor(
        warningProgress.value,
        [0, 1],
        [normalColor, warnColor],
      ),
      borderWidth: 1 + selectedProgress.value,
    }
  })

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Animated.View
        style={[
          styles.freqTile,
          // Match el category rail tile bg (`theme.colors.surface`) así
          // ambos rails comparten el mismo light-mode tone en vez de
          // mezclar white categories con cream-tinted frequency tiles.
          { backgroundColor: theme.colors.surface },
          // `neo` reemplaza el borde animado por el idioma del handoff:
          // ELEVADO en reposo y HUNDIDO con anillo al seleccionar. El
          // seleccionado no se rellena — se hunde, que es el recurso de
          // "presionado" del neumorfismo. El borde se anula (`borderWidth: 0`)
          // para que no conviva con el anillo.
          neo ? null : borderStyle,
          neo
            ? {
                borderRadius: neo.add.tile.radius,
                borderWidth: 0,
                backgroundColor: neo.add.tile.idleBackground ?? theme.colors.surface,
                boxShadow: selected
                  ? `${neo.add.tile.selectedShadow}, 0 0 0 2.5px ${neo.add.tile.selectedRing}`
                  : neo.add.tile.idleShadow,
              }
            : null,
        ]}
      >
        {CATEGORY_ICONS[icon] ? (
          <Image
            source={CATEGORY_ICONS[icon]}
            style={styles.freqTileImage}
            resizeMode="contain"
          />
        ) : (
          <Text allowFontScaling={false} style={styles.freqTileIcon}>
            {icon}
          </Text>
        )}
        <Text
          style={[styles.freqTileLabel, { color: theme.colors.text }]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  freqTile: {
    width: 72,
    height: 72,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  freqTileIcon: {
    fontSize: 22,
    lineHeight: 26,
    textAlign: 'center',
    includeFontPadding: false,
  },
  freqTileImage: { width: 32, height: 32 },
  freqTileLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: -0.1,
    textAlign: 'center',
    width: '100%',
  },
})
