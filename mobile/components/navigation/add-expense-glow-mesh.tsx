import { View } from 'react-native'
import { getOptionalSkiaModule } from '@/lib/optional-skia'
import {
  ADD_BUTTON_GLOW_SIZE,
  clamp,
  interpolateValue,
} from '@/components/navigation/add-expense-tab-button.model'
import { radii } from '@/theme/palette'

export function AddExpenseGlowMesh({
  intensity,
  isDark,
}: {
  intensity: number
  isDark: boolean
}) {
  const skia = getOptionalSkiaModule()
  const normalizedIntensity = clamp(interpolateValue(intensity, [0, 1.75], [0, 1]))
  const center = ADD_BUTTON_GLOW_SIZE / 2
  const glowPeakAlpha = interpolateValue(
    normalizedIntensity,
    [0, 1],
    [0.03, isDark ? 0.24 : 0.2],
  )
  const glowMidAlpha = interpolateValue(
    normalizedIntensity,
    [0, 1],
    [0.02, isDark ? 0.12 : 0.1],
  )
  const glowTailAlpha = interpolateValue(
    normalizedIntensity,
    [0, 1],
    [0.01, isDark ? 0.045 : 0.038],
  )

  if (!skia) {
    return (
      <View style={{ height: ADD_BUTTON_GLOW_SIZE, width: ADD_BUTTON_GLOW_SIZE }}>
        <View
          style={{
            position: 'absolute',
            left: 34,
            top: 34,
            width: ADD_BUTTON_GLOW_SIZE - 68,
            height: ADD_BUTTON_GLOW_SIZE - 68,
            borderRadius: radii.pill,
            backgroundColor: isDark
              ? `rgba(102, 255, 173, ${glowMidAlpha * 0.54})`
              : `rgba(70, 233, 144, ${glowMidAlpha * 0.5})`,
            opacity: 0.6 + normalizedIntensity * 0.35,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 76,
            top: 76,
            width: ADD_BUTTON_GLOW_SIZE - 152,
            height: ADD_BUTTON_GLOW_SIZE - 152,
            borderRadius: radii.pill,
            backgroundColor: isDark
              ? `rgba(190, 255, 214, ${glowPeakAlpha * 0.72})`
              : `rgba(238, 255, 244, ${glowPeakAlpha * 0.7})`,
            opacity: 0.5 + normalizedIntensity * 0.4,
          }}
        />
      </View>
    )
  }

  const { Canvas, Circle, Paint, RadialGradient, vec } = skia

  return (
    <Canvas style={{ height: ADD_BUTTON_GLOW_SIZE, width: ADD_BUTTON_GLOW_SIZE }}>
      <Circle c={vec(center, center)} color="transparent" r={124}>
        <Paint blendMode="screen">
          <RadialGradient
            c={vec(center, center)}
            colors={[
              isDark
                ? `rgba(232, 255, 241, ${glowPeakAlpha * 0.24})`
                : `rgba(241, 255, 246, ${glowPeakAlpha * 0.22})`,
              isDark
                ? `rgba(132, 255, 184, ${glowPeakAlpha})`
                : `rgba(102, 255, 173, ${glowPeakAlpha})`,
              isDark
                ? `rgba(74, 247, 142, ${glowMidAlpha})`
                : `rgba(50, 233, 127, ${glowMidAlpha})`,
              isDark
                ? `rgba(59, 224, 122, ${glowTailAlpha})`
                : `rgba(36, 209, 108, ${glowTailAlpha})`,
              'rgba(0, 0, 0, 0)',
            ]}
            positions={[0.08, 0.24, 0.5, 0.76, 1]}
            r={124}
          />
        </Paint>
      </Circle>
    </Canvas>
  )
}
