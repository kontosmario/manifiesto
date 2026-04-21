import {
  Animated,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { AuthLaunchSplashBackdrop } from '@/components/auth/auth-launch-splash-backdrop'
import { AuthLaunchSplashContent } from '@/components/auth/auth-launch-splash-content'
import { useAuthLaunchSplashAnimation } from '@/features/auth/use-auth-launch-splash-animation'

interface AuthLaunchSplashProps {
  onComplete?: () => void
  persistent?: boolean
  reducedMotion?: boolean
}

export function AuthLaunchSplash({
  onComplete,
  persistent = false,
  reducedMotion = false,
}: AuthLaunchSplashProps) {
  const { width, height } = useWindowDimensions()
  const animation = useAuthLaunchSplashAnimation({
    onComplete,
    persistent,
    reducedMotion,
    width,
  })

  return (
    <Animated.View style={[styles.overlay, { opacity: animation.overlayOpacity }]}>
      <AuthLaunchSplashBackdrop glowScale={animation.glowScale} height={height} />
      <AuthLaunchSplashContent
        badgeOpacity={animation.badgeOpacity}
        badgeTranslateY={animation.badgeTranslateY}
        shimmerOffset={animation.shimmerOffset}
        shimmerWidth={animation.shimmerWidth}
        stageOpacity={animation.stageOpacity}
        subtitleOpacity={animation.subtitleOpacity}
        subtitleTranslateY={animation.subtitleTranslateY}
        titleOpacity={animation.titleOpacity}
        titleTranslateY={animation.titleTranslateY}
        walletHeight={animation.walletHeight}
        walletLift={animation.walletLift}
        walletOpacity={animation.walletOpacity}
        walletScale={animation.walletScale}
        walletTranslateY={animation.walletTranslateY}
        walletWidth={animation.walletWidth}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
})
