import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useAppTheme } from '@/theme/theme-provider'
import { withAlpha } from '@/theme/color-utils'
import { brand, radii } from '@/theme/palette'

export function TabBarBackground() {
  const { theme } = useAppTheme()

  return (
    <View style={[StyleSheet.absoluteFill, styles.tabBarBackground, { pointerEvents: 'none' }]}>
      {/* Base fill — warm cream in light, deep onyx-green in dark to echo the hero card */}
      <LinearGradient
        colors={
          theme.isDark
            ? ['rgba(19, 30, 23, 0.98)', 'rgba(13, 22, 16, 0.97)', 'rgba(9, 15, 11, 0.99)']
            : ['rgba(253, 252, 249, 0.98)', 'rgba(247, 244, 237, 0.97)', 'rgba(250, 248, 243, 0.99)']
        }
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Hairline brand accent on the top edge — Manifiesto signature line */}
      <LinearGradient
        colors={[
          'transparent',
          withAlpha(brand.bright, theme.isDark ? 0.45 : 0.32),
          'transparent',
        ]}
        end={{ x: 1, y: 0 }}
        start={{ x: 0, y: 0 }}
        style={styles.brandAccentLine}
      />

      {/* Subtle inner edge */}
      <View
        style={[
          styles.tabBarInset,
          {
            borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.8)',
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  tabBarBackground: {
    borderRadius: radii['2xl'],
    overflow: 'hidden',
  },
  brandAccentLine: {
    position: 'absolute',
    top: 0,
    left: 32,
    right: 32,
    height: 1.5,
    borderRadius: radii.pill,
  },
  tabBarInset: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii['2xl'],
    borderWidth: 1,
  },
})
