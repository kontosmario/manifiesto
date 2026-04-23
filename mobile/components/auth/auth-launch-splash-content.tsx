import { Animated, Image, StyleSheet, Text, View } from 'react-native'
import { authPalette, authTitleFontFamily } from '@/theme/auth-theme'
import { radii } from '@/theme/palette'
import { withAlpha } from '@/theme/color-utils'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const walletSplash = require('../../../assets/brand/wallet-cartoon-fallback.png') as number

const AnimatedImage = Animated.createAnimatedComponent(Image)
type AnimatedScalar = Animated.AnimatedInterpolation<number> | Animated.Value

interface AuthLaunchSplashContentProps {
  badgeOpacity: AnimatedScalar
  badgeTranslateY: AnimatedScalar
  shimmerOffset: AnimatedScalar
  shimmerWidth: number
  stageOpacity: AnimatedScalar
  subtitleOpacity: AnimatedScalar
  subtitleTranslateY: AnimatedScalar
  titleOpacity: AnimatedScalar
  titleTranslateY: AnimatedScalar
  walletHeight: number
  walletLift: AnimatedScalar
  walletOpacity: AnimatedScalar
  walletScale: AnimatedScalar
  walletTranslateY: AnimatedScalar
  walletWidth: number
}

export function AuthLaunchSplashContent({
  badgeOpacity,
  badgeTranslateY,
  shimmerOffset,
  shimmerWidth,
  stageOpacity,
  subtitleOpacity,
  subtitleTranslateY,
  titleOpacity,
  titleTranslateY,
  walletHeight,
  walletLift,
  walletOpacity,
  walletScale,
  walletTranslateY,
  walletWidth,
}: AuthLaunchSplashContentProps) {
  return (
    <Animated.View style={[styles.content, { opacity: stageOpacity }]}>
      <Animated.View
        style={[
          styles.badge,
          {
            opacity: badgeOpacity,
            transform: [{ translateY: badgeTranslateY }],
          },
        ]}
      >
        <Text style={styles.badgeText}>FINANZAS PARA TODOS</Text>
      </Animated.View>

      <View style={styles.walletStage}>
        <Animated.View
          style={[
            styles.walletHalo,
            {
              width: walletWidth * 0.96,
              height: walletWidth * 0.96,
              transform: [{ scale: walletScale }],
            },
          ]}
        />
        <AnimatedImage
          defaultSource={walletSplash}
          source={walletSplash}
          style={[
            styles.walletImage,
            {
              width: walletWidth,
              height: walletHeight,
              opacity: walletOpacity,
              transform: [
                { translateY: walletTranslateY },
                { translateY: walletLift },
                { scale: walletScale },
              ],
            },
          ]}
        />
      </View>

      <Animated.Text
        style={[
          styles.title,
          {
            fontFamily: authTitleFontFamily,
            opacity: titleOpacity,
            transform: [{ translateY: titleTranslateY }],
          },
        ]}
      >
        Manifiesto
      </Animated.Text>

      <Animated.Text
        style={[
          styles.subtitle,
          {
            opacity: subtitleOpacity,
            transform: [{ translateY: subtitleTranslateY }],
          },
        ]}
      >
        Entrá a tu espacio financiero, claro desde el primer toque.
      </Animated.Text>

      <View style={[styles.shimmerTrack, { width: shimmerWidth }]}>
        <Animated.View
          style={[
            styles.shimmerBar,
            {
              transform: [{ translateX: shimmerOffset }],
            },
          ]}
        />
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 56,
    paddingBottom: 46,
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: authPalette.splash.badgeBorder,
    backgroundColor: authPalette.splash.badgeBackground,
  },
  badgeText: {
    color: authPalette.splash.badgeText,
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 2.1,
    textAlign: 'center',
  },
  walletStage: {
    marginTop: 26,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletHalo: {
    position: 'absolute',
    borderRadius: radii.pill,
    backgroundColor: authPalette.splash.halo,
  },
  walletImage: {
    resizeMode: 'contain',
    boxShadow: `0px 14px 18px ${withAlpha(authPalette.splash.titleShadow, 0.28)}`,
  },
  title: {
    color: authPalette.splash.title,
    fontSize: 46,
    lineHeight: 52,
    fontWeight: '700',
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    maxWidth: 290,
    color: authPalette.splash.subtitle,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'center',
  },
  shimmerTrack: {
    marginTop: 32,
    height: 5,
    borderRadius: radii.pill,
    overflow: 'hidden',
    backgroundColor: authPalette.splash.shimmerTrack,
  },
  shimmerBar: {
    width: '48%',
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: authPalette.splash.shimmerValue,
  },
})
