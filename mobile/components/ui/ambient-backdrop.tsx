import { StyleSheet, View } from 'react-native'
import { withAlpha } from '@/theme/color-utils'
import { radii } from '@/theme/palette'
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

export function AmbientBackdrop({ variant }: { variant: AmbientBackdropVariant }) {
  const { theme } = useAppTheme()

  if (theme.isDark) {
    return null
  }

  const variantGlows: Record<AmbientBackdropVariant, AmbientGlowConfig[]> = {
    control: [
      {
        width: 228,
        height: 228,
        top: 8,
        right: -88,
        backgroundColor: withAlpha(theme.colors.primary, 0.06),
      },
      {
        width: 188,
        height: 188,
        left: -92,
        top: 236,
        backgroundColor: withAlpha(theme.colors.success, 0.04),
      },
      {
        width: 166,
        height: 166,
        right: -32,
        bottom: 118,
        backgroundColor: withAlpha(theme.colors.warning, 0.035),
      },
    ],
    commitments: [
      {
        width: 220,
        height: 220,
        top: -92,
        right: -58,
        backgroundColor: withAlpha(theme.colors.primary, 0.07),
      },
      {
        width: 180,
        height: 180,
        left: -64,
        top: 220,
        backgroundColor: withAlpha(theme.colors.primaryStrong, 0.045),
      },
      {
        width: 240,
        height: 240,
        right: -112,
        bottom: 54,
        backgroundColor: withAlpha(theme.colors.warning, 0.05),
      },
    ],
    form: [
      {
        width: 214,
        height: 214,
        top: 16,
        right: -84,
        backgroundColor: withAlpha(theme.colors.primary, 0.05),
      },
      {
        width: 168,
        height: 168,
        left: -78,
        top: 278,
        backgroundColor: withAlpha(theme.colors.success, 0.04),
      },
      {
        width: 140,
        height: 140,
        right: -22,
        bottom: 122,
        backgroundColor: withAlpha(theme.colors.warning, 0.035),
      },
    ],
    history: [
      {
        width: 220,
        height: 220,
        top: 18,
        right: -90,
        backgroundColor: withAlpha(theme.colors.primary, 0.05),
      },
      {
        width: 176,
        height: 176,
        left: -82,
        top: 298,
        backgroundColor: withAlpha(theme.colors.success, 0.04),
      },
      {
        width: 142,
        height: 142,
        right: -26,
        bottom: 138,
        backgroundColor: withAlpha(theme.colors.warning, 0.03),
      },
    ],
    home: [
      {
        width: 220,
        height: 220,
        top: 34,
        right: -92,
        backgroundColor: withAlpha(theme.colors.primary, 0.045),
      },
      {
        width: 190,
        height: 190,
        left: -98,
        top: 328,
        backgroundColor: withAlpha(theme.colors.success, 0.035),
      },
      {
        width: 140,
        height: 140,
        right: -24,
        bottom: 84,
        backgroundColor: withAlpha(theme.colors.warning, 0.03),
      },
    ],
  }

  return (
    <View style={[styles.backdrop, { pointerEvents: 'none' }]}>
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
}

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
