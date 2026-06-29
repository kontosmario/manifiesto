import { Image, type ImageSourcePropType, StyleSheet, View } from 'react-native'
import { useThemeTokens } from '@/theme/theme-provider'

interface CategoryStickerProps {
  source: ImageSourcePropType
  /** Lado del sticker en px. El footprint del componente == size en AMBOS
   *  modos, así no cambia el layout del caller. */
  size: number
}

/**
 * Sticker PNG con backing legible en DARK mode.
 *
 * Los stickers multicolor del owner están ilustrados para fondo CLARO (bordes
 * y siluetas oscuras + brillos blancos). Sobre los badges oscuros del dark mode
 * (`hue.surface` oscuro, `surfaceMuted`, category-color tint) sus bordes
 * oscuros se funden y pierden legibilidad. Acá los apoyamos sobre una placa
 * clara — su entorno nativo, idéntico al que ya se ve perfecto en light mode —
 * SOLO en dark. En light mode se renderiza el Image tal cual (sin placa), así
 * que el look de light mode no cambia.
 *
 * Centralizado para cubrir las 3 vías por las que se pinta un sticker: las
 * categorías (`CategoryIcon`) y los ingresos (picker de add-ingreso +
 * `income-row`), que usan el sticker por key directa del registry.
 */
export function CategorySticker({ source, size }: CategoryStickerProps) {
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
        { width: size, height: size, borderRadius: Math.round(size * 0.3) },
      ]}
    >
      {image}
    </View>
  )
}

const styles = StyleSheet.create({
  plate: {
    // Off-white cálido: recrea el fondo claro para el que los stickers fueron
    // ilustrados (mismo entorno que en light mode → legibilidad garantizada).
    backgroundColor: '#F4F0E7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})
