import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { withAlpha } from '@/theme/color-utils'
import { radii } from '@/theme/palette'
import { neoTokens } from '@/theme/neo-tokens'
import { useAppTheme } from '@/theme/theme-provider'

type AmbientBackdropVariant = 'home' | 'form' | 'history' | 'commitments' | 'control'

interface AmbientGlowConfig {
  backgroundColor: string
  bottom?: number
  height: number
  left?: number
  right?: number
  top?: number
  width: number
}

/**
 * Halos de ambiente detrás del contenido, sólo en claro (en oscuro el
 * canvas ya es profundo y cualquier halo se lee como una mancha).
 *
 * La paleta sale del vocabulario neo: verde del sistema para los dos
 * halos de peso y el naranja de alerta para el calor de abajo. Las alfas
 * (3–7%) y la geometría son las mismas de siempre — sobre el canvas
 * salvia el tinte baja ~4% de luminosidad, que es exactamente el
 * gradiente de profundidad que estos halos existen para dar.
 */
export const AmbientBackdrop = memo(function AmbientBackdrop({ variant }: { variant: AmbientBackdropVariant }) {
  const { theme } = useAppTheme()

  if (theme.isDark) {
    return null
  }

  const neo = neoTokens('light')
  const variantGlows: Record<AmbientBackdropVariant, AmbientGlowConfig[]> = {
    control: [
      {
        width: 228,
        height: 228,
        top: 8,
        right: -88,
        backgroundColor: withAlpha(neo.green, 0.06),
      },
      {
        width: 188,
        height: 188,
        left: -92,
        top: 236,
        backgroundColor: withAlpha(neo.greenDeep, 0.04),
      },
      {
        width: 166,
        height: 166,
        right: -32,
        bottom: 118,
        backgroundColor: withAlpha(neo.warm, 0.035),
      },
    ],
    commitments: [
      {
        width: 220,
        height: 220,
        top: -92,
        right: -58,
        backgroundColor: withAlpha(neo.green, 0.07),
      },
      {
        width: 180,
        height: 180,
        left: -64,
        top: 220,
        backgroundColor: withAlpha(neo.greenDeep, 0.045),
      },
      {
        width: 240,
        height: 240,
        right: -112,
        bottom: 54,
        backgroundColor: withAlpha(neo.warm, 0.05),
      },
    ],
    form: [
      {
        width: 214,
        height: 214,
        top: 16,
        right: -84,
        backgroundColor: withAlpha(neo.green, 0.05),
      },
      {
        width: 168,
        height: 168,
        left: -78,
        top: 278,
        backgroundColor: withAlpha(neo.greenDeep, 0.04),
      },
      {
        width: 140,
        height: 140,
        right: -22,
        bottom: 122,
        backgroundColor: withAlpha(neo.warm, 0.035),
      },
    ],
    history: [
      {
        width: 220,
        height: 220,
        top: 18,
        right: -90,
        backgroundColor: withAlpha(neo.green, 0.05),
      },
      {
        width: 176,
        height: 176,
        left: -82,
        top: 298,
        backgroundColor: withAlpha(neo.greenDeep, 0.04),
      },
      {
        width: 142,
        height: 142,
        right: -26,
        bottom: 138,
        backgroundColor: withAlpha(neo.warm, 0.03),
      },
    ],
    home: [
      // Arriba-derecha: verde de acción, el halo de más peso.
      {
        width: 220,
        height: 220,
        top: 34,
        right: -92,
        backgroundColor: withAlpha(neo.green, 0.045),
      },
      // Medio-izquierda: naranja de alerta en lugar de un segundo verde,
      // para que el fondo no se lea monocromo a lo alto de la página.
      {
        width: 190,
        height: 190,
        left: -98,
        top: 328,
        backgroundColor: withAlpha(neo.warm, 0.04),
      },
      // Abajo-derecha: verde profundo, el ancla de la composición.
      {
        width: 140,
        height: 140,
        right: -24,
        bottom: 84,
        backgroundColor: withAlpha(neo.greenDeep, 0.03),
      },
    ],
  }

  return (
    <View pointerEvents="none" style={styles.backdrop}>
      {variantGlows[variant].map((glow, index) => (
        <View
          key={`${variant}-${index}`}
          style={[
            styles.glow,
            {
              backgroundColor: glow.backgroundColor,
              bottom: glow.bottom,
              height: glow.height,
              left: glow.left,
              right: glow.right,
              top: glow.top,
              width: glow.width,
            },
          ]}
        />
      ))}
    </View>
  )
})

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
  },
  glow: {
    position: 'absolute',
    borderRadius: radii.pill,
  },
})
