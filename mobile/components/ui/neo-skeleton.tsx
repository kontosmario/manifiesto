import { useMemo } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { NeoSurface } from '@/components/ui/neo-surface'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { decorativeDurations } from '@/lib/motion'
import { withAlpha } from '@/theme/color-utils'
import { cssGradient, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Piel de los estados de carga. `'classic'` (default en todas las
 * primitivas) mantiene el material V1 para las pantallas que todavía no
 * pasaron por el rediseño; `'neo'` las dibuja con el vocabulario
 * neumórfico.
 */
export type SkeletonSkin = 'classic' | 'neo'

const SHEEN_LEG_MS = decorativeDurations.shimmer / 2
const SHEEN_FLOOR = 0.2
const SHEEN_PEAK = 1
/** Valor de reposo con Reduce Motion / gama baja: media luz, sin loop. */
const SHEEN_REST = 0.55

interface NeoSkeletonProps {
  width?: DimensionValue
  height?: number
  radius?: number
  style?: StyleProp<ViewStyle>
}

/**
 * Placa de contenido pendiente en material neumórfico: un POZO
 * (`neo.well` + `insetSm`), no un rectángulo gris. El hueco es el
 * vocabulario natural para "acá todavía no hay nada" — el relieve del
 * rediseño ya usa el inset para todo lo que está vacío o a la espera
 * (inputs, displays, calendarios).
 *
 * El brillo es una banda diagonal del par `raisedGradient`, no el
 * shimmer gris de la V1: en ambos temas la luz del material raised está
 * a pocos puntos del pozo (claro `#F0F2E7` sobre `#E9EBE0`), así que la
 * animación se lee como luz moviéndose DENTRO del hueco y nunca como un
 * bloque que parpadea.
 *
 * La banda va a alpha 0 en los dos extremos a propósito: un hijo
 * absolute-fill se dibuja ENCIMA de las sombras inset (ver
 * `neo-surface`), así que con las puntas opacas taparía justo el relieve
 * que define el pozo.
 */
export function NeoSkeleton({
  width = '100%',
  height = 16,
  radius = neoRadii.tile,
  style,
}: NeoSkeletonProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const isDark = theme.mode === 'dark'
  const reduceMotion = useReducedMotion()
  const sheen = useSharedValue(SHEEN_REST)

  useLoopAnimation(
    () => {
      const ease = Easing.inOut(Easing.quad)
      sheen.value = withRepeat(
        withSequence(
          withTiming(SHEEN_PEAK, { duration: SHEEN_LEG_MS, easing: ease }),
          withTiming(SHEEN_FLOOR, { duration: SHEEN_LEG_MS, easing: ease }),
        ),
        -1,
        false,
      )
    },
    [sheen],
  )

  const plateStyle = useMemo<ViewStyle>(
    () => ({
      backgroundColor: neo.well,
      borderRadius: radius,
      boxShadow: neo.shadows.insetSm,
      // Android < API 29 descarta el boxShadow INSET en silencio: sin él
      // el pozo queda del mismo material que su contenedor y la placa
      // desaparece.
      ...(SUPPORTS_INSET_SHADOW
        ? null
        : { borderWidth: 1, borderColor: neo.sheetDivider }),
    }),
    [neo, radius],
  )

  const sheenStyle = useMemo<ViewStyle>(() => {
    const light = neo.raisedGradient[0]
    return {
      borderRadius: radius,
      ...cssGradient(
        `linear-gradient(115deg, ${withAlpha(light, 0)} 0%, ${withAlpha(
          light,
          isDark ? 0.8 : 0.95,
        )} 50%, ${withAlpha(light, 0)} 100%)`,
        withAlpha(light, isDark ? 0.3 : 0.4),
      ),
    }
  }, [neo, isDark, radius])

  const sheenAnimatedStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? SHEEN_REST : sheen.value,
  }))

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[plateStyle, { width, height }, style]}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, sheenStyle, sheenAnimatedStyle]}
      />
    </View>
  )
}

interface NeoLoadingBlockProps {
  label?: string
}

/**
 * Bloque de carga en material neo: la card extruida (`raisedMd`) con las
 * placas del contenido que viene y el spinner en tinta apagada.
 *
 * Reemplaza a `LoadingBlock`, primitiva V1 cuyo `surfaceMuted` + hairline
 * se lee como un parche de la piel vieja sobre el canvas del rediseño.
 */
export function NeoLoadingBlock({ label }: NeoLoadingBlockProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()
  const resolvedLabel = label ?? t('states:loading.generic')

  return (
    <View accessibilityLabel={resolvedLabel} accessibilityLiveRegion="polite">
      <NeoSurface radius={neoRadii.card} style={styles.block} variant="raisedMd">
        <View style={styles.skeletonStack}>
          <NeoSkeleton height={12} radius={neoRadii.chip} width="34%" />
          <NeoSkeleton height={18} radius={neoRadii.chip} width="100%" />
          <NeoSkeleton height={18} radius={neoRadii.chip} width="84%" />
        </View>
        <View style={styles.labelRow}>
          <ActivityIndicator color={neo.textMuted} size="small" />
          <Text style={[styles.label, { color: neo.textMuted }]}>{resolvedLabel}</Text>
        </View>
      </NeoSurface>
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  skeletonStack: {
    gap: 10,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 20,
  },
})
