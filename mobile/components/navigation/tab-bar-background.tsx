import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

export function TabBarBackground() {
  const { theme } = useAppTheme()

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tabBarBackground]}>
      <LinearGradient
        colors={
          theme.isDark
            ? ['rgba(15, 22, 18, 0.98)', 'rgba(11, 18, 14, 0.97)', 'rgba(8, 13, 10, 0.99)']
            : ['rgba(252, 253, 252, 0.98)', 'rgba(243, 247, 244, 0.97)', 'rgba(248, 251, 249, 0.99)']
        }
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.tabBarGlow,
          styles.tabBarGlowPrimary,
          {
            backgroundColor: theme.isDark ? 'rgba(78, 213, 133, 0.1)' : 'rgba(25, 182, 107, 0.08)',
          },
        ]}
      />
      <View
        style={[
          styles.tabBarGlow,
          styles.tabBarGlowSecondary,
          {
            backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(255, 255, 255, 0.48)',
          },
        ]}
      />
      <LinearGradient
        colors={
          theme.isDark
            ? ['rgba(127, 210, 148, 0.14)', 'rgba(127, 210, 148, 0.03)', 'transparent']
            : ['rgba(25, 182, 107, 0.09)', 'rgba(25, 182, 107, 0.02)', 'transparent']
        }
        end={{ x: 0.5, y: 1 }}
        start={{ x: 0.5, y: 0.02 }}
        style={styles.tabBarTint}
      />
      <LinearGradient
        colors={
          theme.isDark
            ? ['rgba(255, 255, 255, 0.14)', 'rgba(255, 255, 255, 0.02)', 'transparent']
            : ['rgba(255, 255, 255, 0.96)', 'rgba(255, 255, 255, 0.18)', 'transparent']
        }
        end={{ x: 0.7, y: 1 }}
        start={{ x: 0.12, y: 0 }}
        style={styles.tabBarShine}
      />
      <View
        style={[
          styles.tabBarInset,
          {
            borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(255, 255, 255, 0.74)',
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
  tabBarTint: {
    ...StyleSheet.absoluteFillObject,
  },
  tabBarGlow: {
    position: 'absolute',
    borderRadius: radii.pill,
  },
  tabBarGlowPrimary: {
    width: 172,
    height: 172,
    top: -116,
    right: -18,
  },
  tabBarGlowSecondary: {
    width: 128,
    height: 128,
    left: 18,
    top: -58,
  },
  tabBarShine: {
    position: 'absolute',
    top: 0,
    left: 18,
    right: 18,
    height: 1,
  },
  tabBarInset: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii['2xl'],
    borderWidth: 1,
  },
})
