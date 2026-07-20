import { useMemo, type PropsWithChildren } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { cssGradient, neoRadii, neoTokens, type NeoShadows } from '@/theme/neo-tokens'
import { useThemeTokens } from '@/theme/theme-provider'

export type NeoVariant = keyof NeoShadows

interface NeoSurfaceProps {
  /** Receta de sombra del design doc. Default: card estándar. */
  variant?: NeoVariant
  /** Radio del borde. Vocabulario del rediseño en `neoRadii`. */
  radius?: number
  /**
   * Fondo custom (chips de estado, tiles pastel, fills sólidos). Si se
   * omite, cada variante usa su material del tema: raised → gradiente
   * 145deg, hero → gradiente verde 3 stops, sheet → sólido, inset → pozo.
   */
  backgroundColor?: string
  style?: StyleProp<ViewStyle>
}

/**
 * Superficie neumórfica del rediseño 2026-07 (handoff-README §Design
 * Tokens). Aplica la receta de sombra (multi-sombra `boxShadow`,
 * soportado por Fabric en RN 0.81) y el material correcto por variante
 * y tema.
 *
 * El gradiente va en el MISMO view vía `cssGradient()`
 * (experimental_backgroundImage), no como child de expo-linear-gradient:
 * en Android los inner shadows del boxShadow se dibujan en el drawable
 * de fondo DEBAJO de los children, así que un gradiente absolute-fill
 * taparía la línea de luz `inset 0 1px 0` de hero/raisedXl. Con el
 * background en el propio view, ambas plataformas pintan los inset
 * encima del gradiente, como en CSS (mismo patrón que NeoTabBar).
 *
 * El CTA radial verde NO va acá — eso lo cubre el botón dedicado del
 * rediseño.
 */
export function NeoSurface({
  variant = 'raisedLg',
  radius = neoRadii.card,
  backgroundColor,
  style,
  children,
}: PropsWithChildren<NeoSurfaceProps>) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)

  const isHero = variant === 'hero'
  const isRaised = variant.startsWith('raised')
  const isInset = variant.startsWith('inset') || variant === 'ringSelected'

  const gradientCss: string | null = backgroundColor
    ? null
    : isHero
      ? neo.heroGradientCss
      : isRaised
        ? neo.raisedGradientCss
        : null

  // Fallback si el CSS no es soportado: hero → stop del medio del
  // gradiente; raised → superficie plana del tema.
  const gradientFallback = isHero ? neo.heroGradient[1] : neo.surface

  // Material plano por variante cuando no hay gradiente ni override:
  // sheet → sólido del tema; inset/ring → pozo; cta → superficie (el
  // fill radial real lo pone el botón dedicado encima).
  const flatBackground =
    variant === 'sheet' ? neo.sheet : isInset ? neo.well : neo.surface

  const baseStyle = useMemo<ViewStyle>(
    () => ({
      borderRadius: radius,
      boxShadow: neo.shadows[variant],
      ...(gradientCss
        ? cssGradient(gradientCss, gradientFallback)
        : { backgroundColor: backgroundColor ?? flatBackground }),
    }),
    [radius, neo, variant, gradientCss, gradientFallback, backgroundColor, flatBackground],
  )

  return <View style={[baseStyle, style]}>{children}</View>
}
