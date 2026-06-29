import { Image, type ImageSourcePropType, StyleSheet, View } from 'react-native'
import { useThemeTokens } from '@/theme/theme-provider'

interface CategoryStickerProps {
  source: ImageSourcePropType
  /** Lado del sticker en px. El footprint del componente == size en AMBOS
   *  modos, así no cambia el layout del caller. */
  size: number
  /** Color de la placa detrás del sticker en DARK mode. Se le pasa el pastel
   *  CLARO del hue de la categoría → el ícono queda sobre SU color (lo resalta,
   *  igual que en light mode) en vez de un neutro. Default: off-white cálido. */
  plateColor?: string
}

/**
 * Sticker PNG con backing legible en DARK mode.
 *
 * Los stickers multicolor del owner están ilustrados para fondo CLARO (bordes
 * y siluetas oscuras + brillos blancos). Sobre los badges oscuros del dark mode
 * sus bordes oscuros se funden y pierden legibilidad. Acá los apoyamos sobre
 * una placa con el PASTEL CLARO del hue (`plateColor`) — el mismo fondo que en
 * light mode, así el ícono se resalta con su propio color — SOLO en dark. En
 * light mode se renderiza el Image tal cual (sin placa), sin cambiar ese look.
 *
 * Centralizado para cubrir las 3 vías por las que se pinta un sticker: las
 * categorías (`CategoryIcon`) y los ingresos (picker de add-ingreso +
 * `income-row`), que usan el sticker por key directa del registry.
 */
export function CategorySticker({ source, size, plateColor = '#F4F0E7' }: CategoryStickerProps) {
  const theme = useThemeTokens()
  const image = (
    <Image
      source={source}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  )

  if (!theme.isDark) return image

  return (
    <View
      style={[
        styles.plate,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.3),
          backgroundColor: plateColor,
        },
      ]}
    >
      {image}
    </View>
  )
}

const styles = StyleSheet.create({
  plate: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})
