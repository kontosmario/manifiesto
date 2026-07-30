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
          // Handoff: CHIP horizontal (r15, 9×15), no tile cuadrado. El ícono se
          // conserva a pedido del owner —el markup lo dibuja sin ícono— y va
          // adentro del chip, a la izquierda del label.
          neo ? styles.freqChipNeo : null,
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
                borderRadius: neo.add.freqChip.radius,
                borderWidth: 0,
                paddingHorizontal: neo.add.freqChip.padH,
                paddingVertical: neo.add.freqChip.padV,
                // Activo: RELLENO oscuro con drop shadow. Acá el handoff SÍ
                // rellena, a diferencia de los tiles de categoría que se hunden.
                backgroundColor: selected
                  ? neo.add.freqChip.activeBackground
                  : neo.add.quickChip.background,
                experimental_backgroundImage: selected
                  ? undefined
                  : neo.add.quickChip.gradientCss,
                boxShadow: selected
                  ? neo.add.freqChip.activeShadow
                  : neo.add.quickChip.shadow,
              }
            : null,
        ]}
      >
        {CATEGORY_ICONS[icon] ? (
          <Image
            source={CATEGORY_ICONS[icon]}
            style={[styles.freqTileImage, neo ? styles.freqChipImageNeo : null]}
            resizeMode="contain"
          />
        ) : (
          <Text allowFontScaling={false} style={styles.freqTileIcon}>
            {icon}
          </Text>
        )}
        <Text
          style={[
            styles.freqTileLabel,
            { color: theme.colors.text },
            neo
              ? {
                  fontSize: neo.add.freqChip.fontSize,
                  fontWeight: '800' as const,
                  fontFamily: neo.font('800'),
                  // Inactivo va en tinta SUB, no en la del título: en oscuro
                  // los 6 chips apagados gritaban en crema `#F1EEDD` y
                  // mataban la jerarquía contra el activo.
                  color: selected ? neo.add.freqChip.activeInk : neo.mutedInk,
                  width: 'auto' as const,
                }
              : null,
          ]}
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
  // Chip horizontal del handoff: alto natural, ícono + label en fila.
  //
  // El handoff dibuja los chips SIN ícono; conservarlos fue decisión del owner.
  // A 18px el sticker era una mancha al lado de un label de 12.5 — a 26 se lee
  // y el chip crece ~6px, que es lo que costaba la decisión.
  freqChipNeo: { width: 'auto', height: 'auto', flexDirection: 'row', gap: 8 },
  freqChipImageNeo: { width: 26, height: 26 },
  freqTileLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: -0.1,
    textAlign: 'center',
    width: '100%',
  },
})
