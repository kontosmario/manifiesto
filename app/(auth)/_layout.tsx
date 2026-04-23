import { Platform } from 'react-native'
import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
        animationMatchesGesture: true,
        freezeOnBlur: true,
        fullScreenGestureEnabled: false,
        gestureEnabled: true,
      }}
    />
  )
}
