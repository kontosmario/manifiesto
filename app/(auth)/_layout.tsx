import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Crossfade between auth routes (welcome → login → signup,
        // login → onboarding) so navigating doesn't slide. Combined
        // with the persistent splash overlay during transitions, the
        // hand-off reads as one continuous brand surface instead of
        // a sequence of pages sliding past each other.
        animation: 'fade',
        animationDuration: 240,
        animationMatchesGesture: true,
        freezeOnBlur: true,
        fullScreenGestureEnabled: false,
        gestureEnabled: true,
      }}
    />
  )
}
