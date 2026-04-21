import '@/lib/runtime'
import { useCallback, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Stack } from 'expo-router'
import { AuthLaunchSplash } from '@/components/auth/auth-launch-splash'
import { NotificationRouterBridge } from '@/components/root/notification-router-bridge'
import { AppProviders } from '@/providers/app-providers'

let hasShownAppLaunchSplash = false

export function RootLayoutShell() {
  const [isLaunchSplashVisible, setLaunchSplashVisible] = useState(() => !hasShownAppLaunchSplash)

  const handleLaunchSplashComplete = useCallback(() => {
    hasShownAppLaunchSplash = true
    setLaunchSplashVisible(false)
  }, [])

  return (
    <AppProviders>
      <View style={styles.root}>
        <NotificationRouterBridge />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
            animationMatchesGesture: true,
            freezeOnBlur: true,
            fullScreenGestureEnabled: false,
            gestureEnabled: true,
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/callback" />
        </Stack>
        {isLaunchSplashVisible ? <AuthLaunchSplash onComplete={handleLaunchSplashComplete} /> : null}
      </View>
    </AppProviders>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})
