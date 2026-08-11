import { memo, type PropsWithChildren } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { CardParticles } from '@/components/ui/card-particles'
import { HOME_SPEC, type HomeMode } from '@/components/redesign/home/home-spec'
import { cssGradient, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { useThemeMode } from '@/theme/theme-provider'

/**
 * Tintas del hero de Ajustes. Valores IDÉNTICOS en claro y oscuro porque el
 * material de abajo también lo es (el gradiente forest del `HOME_SPEC` no
 * cambia con el tema), igual que los chips del hero de la Home.
 *
 * Todas verificadas contra el PEOR stop del forest (#297811, el tramo
 * 67–100%): title 5.02:1 · soft 4.57:1 · accent 4.52:1. Bajarle alpha a
 * `soft` o usar el `heroGreen` oscuro (#A4E3A6, 3.73:1) rompe AA.
 *
 * Los chips se apoyan en `chipBackground` —el pozo oscuro del hero, no un
 * tinte claro—: sobre un tinte claro la tinta crema cae a 3.78:1 en el stop
 * más claro, sobre el pozo queda en 7.20:1 o mejor en todo el gradiente.
 */
export const settingsHeroInk = {
  title: '#F7F4E4',
  soft: 'rgba(240,248,230,0.92)',
  accent: '#C9F3C6',
  chipBackground: 'rgba(11,30,15,0.32)',
  chipInk: '#F2F7E6',
  chipAccentInk: '#DFF7DA',
  chipCautionInk: '#FEF0C2',
  particleAccent: '#FBD9BC',
} as const

interface SettingsHeroCardProps {
  /** Luciérnagas del campo ambiental. 0 lo apaga. */
  particleCount?: number
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
}

/**
 * Hero de las pantallas de Ajustes: el MISMO material que los heros de
 * Inicio/Gastos/Fijos/Control (gradiente forest + `heroShadow` del
 * `HOME_SPEC`), no el verde claro de `neoTokens.heroGradientCss`.
 *
 * El campo de partículas se recorta en su PROPIA capa: un `overflow:'hidden'`
 * sobre la view que lleva el `boxShadow` recorta también la sombra, y el
 * recorte rectangular del glow blanco se lee como un halo cuadrado alrededor
 * de la card.
 */
export const SettingsHeroCard = memo(function SettingsHeroCard({
  particleCount = 10,
  style,
  contentStyle,
  children,
}: PropsWithChildren<SettingsHeroCardProps>) {
  const mode = useThemeMode().resolvedMode as HomeMode
  const spec = HOME_SPEC[mode]
  const neo = neoTokens(mode)

  return (
    <View
      style={[
        styles.card,
        cssGradient(spec.heroGradientCss, neo.greenDeep),
        { boxShadow: spec.heroShadow },
        style,
      ]}
    >
      {particleCount > 0 ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.particleClip]}>
          <CardParticles count={particleCount} accentColor={settingsHeroInk.particleAccent} />
        </View>
      ) : null}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  )
})

const styles = StyleSheet.create({
  card: {
    borderRadius: neoRadii.hero,
    padding: 20,
  },
  particleClip: {
    borderRadius: neoRadii.hero,
    overflow: 'hidden',
  },
  content: {
    gap: 6,
  },
})
