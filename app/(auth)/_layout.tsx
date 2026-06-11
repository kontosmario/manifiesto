import { Stack } from 'expo-router'
import { useAppTheme } from '@/theme/theme-provider'

export default function AuthLayout() {
  const { theme } = useAppTheme()
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
        // Sin contentStyle theme-aware, native-stack default (blanco)
        // se cuela entre dos auth screens durante el fade y se nota como
        // flash blanco en dark mode. Canvas match para que el seam
        // desaparezca.
        contentStyle: { backgroundColor: theme.colors.canvas },
      }}
    >
      {/* Lock screens — swipe-to-dismiss disabled para que el user no
          pueda evadir el gate de auth por swipe-back. Aplica tanto a
          /unlock (biometric) como /pin-unlock (PIN). */}
      <Stack.Screen name="unlock" options={{ gestureEnabled: false }} />
      <Stack.Screen name="pin-unlock" options={{ gestureEnabled: false }} />
    </Stack>
  )
}
