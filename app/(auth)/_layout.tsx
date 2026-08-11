import { Stack } from 'expo-router'
import { AUTH_SPEC } from '@/components/redesign/auth/auth-spec'
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
        // flash blanco en dark mode. El fondo sale del MISMO spec que
        // pintan login/signup/forgot para que el seam desaparezca (la
        // Bienvenida usa su `welcomeBg`, y el fade tapa esa diferencia).
        contentStyle: { backgroundColor: AUTH_SPEC[theme.mode].bg },
      }}
    />
  )
}
