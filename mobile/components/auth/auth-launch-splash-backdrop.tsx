import { Animated, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { authPalette } from '@/theme/auth-theme'
import { radii } from '@/theme/palette'
import { withAlpha } from '@/theme/color-utils'

type AnimatedScalar = Animated.AnimatedInterpolation<number> | Animated.Value

interface AuthLaunchSplashBackdropProps {
  glowScale: AnimatedScalar
  height: number
}

export function AuthLaunchSplashBackdrop({
  glowScale,
  height,
}: AuthLaunchSplashBackdropProps) {
  return (
    <>
      <LinearGradient
        colors={authPalette.splash.overlayGradient}
        end={{ x: 0.9, y: 1 }}
        start={{ x: 0.08, y: 0.02 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.glowPrimary,
            {
              transform: [{ scale: glowScale }],
              top: height * 0.12,
            },
          ]}
        />
        <View style={[styles.glowSecondary, { top: height * 0.16 }]} />
        <View style={styles.noisePlate} />
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  glowPrimary: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: radii.pill,
    backgroundColor: authPalette.splash.glowPrimary,
    boxShadow: `0px 0px 34px ${withAlpha(authPalette.splash.titleGlowShadow, 0.34)}`,
  },
  glowSecondary: {
    position: 'absolute',
    alignSelf: 'center',
    width: 260,
    height: 260,
    borderRadius: radii.pill,
    backgroundColor: authPalette.splash.glowSecondary,
  },
  noisePlate: {
    position: 'absolute',
    left: -60,
    right: -60,
    bottom: -120,
    height: 280,
    borderTopLeftRadius: 180,
    borderTopRightRadius: 180,
    backgroundColor: authPalette.splash.backdropPlate,
    transform: [{ rotate: '-8deg' }],
  },
})
