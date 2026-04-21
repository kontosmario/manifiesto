import { StyleSheet, View } from 'react-native'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface ProgressBarProps {
  value: number
  total: number
  color?: string
  height?: number
}

export function ProgressBar({ value, total, color, height = 8 }: ProgressBarProps) {
  const { theme } = useAppTheme()
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 1
  const rawProgress = Number.isFinite(value) ? value / safeTotal : 0
  const progress = Math.max(0, Math.min(rawProgress, 1))

  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor: theme.colors.surfaceStrong,
          height,
        },
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            backgroundColor: color ?? theme.colors.primary,
            width: `${progress * 100}%`,
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
  },
})
