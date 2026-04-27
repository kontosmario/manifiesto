import { Platform } from 'react-native'
import { Stack } from 'expo-router'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { DailyBudgetNudgeBridge } from '@/components/bridges/daily-budget-nudge-bridge'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useLastUserProfileSync } from '@/features/auth/use-last-user-profile-sync'
import { useTimezoneSync } from '@/features/auth/use-timezone-sync'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'

export function AppStackShell() {
  // Fire the single snapshot RPC at the app-shell level, before any
  // screen or bridge mounts. The RPC seeds every downstream cache
  // (profile, family, expenses, fixed_expenses, family_finance, etc.),
  // so hooks below read from cache and skip their own network calls.
  const session = useAuthSession()
  const userId = session.data?.user.id
  const snapshot = useHomeSnapshot(userId)
  // Mirror the active user's email + display name + avatar to a
  // SecureStore-backed cache so the login screen can show a
  // personalized hero on next launch.
  useLastUserProfileSync()
  // Keep `profiles.timezone` aligned with the device's IANA TZ. The
  // streak trigger reads that column to decide which calendar day an
  // expense belongs to, so this sync is what makes the per-user day
  // boundary work in practice (instead of a hardcoded BA default).
  useTimezoneSync()

  // If the user is authenticated, block the whole app tree until the
  // snapshot is seeded. Everything downstream (RequireAuth, tabs,
  // bridges) then mounts against a hot cache and issues zero extra
  // requests. Unauthenticated users pass through immediately —
  // RequireAuth below will redirect them to /(auth)/login.
  if (userId && !snapshot.data && !snapshot.isError) {
    return <BlockingScreenView message="Preparando tu espacio..." />
  }

  return (
    <>
      <DailyBudgetNudgeBridge />
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
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="onboarding"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
            gestureEnabled: false,
            fullScreenGestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="add-expense"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="add-fixed-expense"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="household-setup"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="expense-filters"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="expense-categories"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            freezeOnBlur: true,
            fullScreenGestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            freezeOnBlur: true,
            fullScreenGestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="settings/notifications"
          options={{
            freezeOnBlur: true,
            fullScreenGestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="settings/family-admin"
          options={{
            freezeOnBlur: true,
            fullScreenGestureEnabled: false,
          }}
        />
      </Stack>
    </>
  )
}
