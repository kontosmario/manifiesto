import { Platform } from 'react-native'
import { Stack } from 'expo-router'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { DailyBudgetNudgeBridge } from '@/components/bridges/daily-budget-nudge-bridge'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useLastUserProfileSync } from '@/features/auth/use-last-user-profile-sync'
import { useTimezoneSync } from '@/features/auth/use-timezone-sync'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { motionDurations } from '@/lib/motion'

// ─── Navigation timing tokens ────────────────────────────────────
// Single source of truth for stack/modal animation pacing. Values
// match the curves prototyped in `docs/transitions-preview.html`.
//
// Note: `@react-navigation/native-stack` (which expo-router wraps)
// only honors `animationDuration` on Android — iOS uses the platform
// curves baked into UIKit. We still set it for consistency and so
// Android matches the same pacing as iOS visually. The
// `'ios_from_right'` animation type pins both platforms to the same
// horizontal slide instead of the platform default.
//
// ─── Architectural decision (2026-04-30) ─────────────────────────
// We deliberately stay on `@react-navigation/native-stack` and do
// NOT migrate to the JS-based `@react-navigation/stack` to get
// custom interpolators (parallax + scale on the outgoing screen,
// per-curve fine-tuning). Rationale:
//   1. Native-stack runs the transition off the JS thread on both
//      iOS (UIKit) and Android (Fragment transitions). The JS stack
//      drives every frame from the bridge — measurable jank on
//      lower-end Android, especially when Reanimated worklets are
//      already saturating the UI thread (which we use heavily).
//   2. Native-stack inherits the OS swipe-back gesture for free,
//      including the predictive back behavior on Android 14+. JS
//      stack reimplements it with PanResponder — buggier under
//      RNGH-heavy screens (we have many: Gastos, Fijos, modales).
//   3. The remaining UX gap (a parallax fade on the previous screen
//      during push) is small. The unified `ios_from_right` +
//      `motionDurations.enterStack` on both platforms already gives
//      a clean, consistent slide that matches the rest of the
//      motion language.
//   4. ModalContentEntrance (see `mobile/components/ui/modal-content-
//      entrance.tsx`) handles the modal-specific layered fade we
//      wanted, without touching the navigation primitive.
//
// Don't reintroduce a JS-stack PR without re-evaluating these four
// points. The trade-off is intentional, not an oversight.
const STACK_PUSH_ANIMATION =
  Platform.OS === 'ios' ? ('default' as const) : ('ios_from_right' as const)
const MODAL_ANIMATION =
  Platform.OS === 'ios' ? ('default' as const) : ('slide_from_bottom' as const)

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
          animation: STACK_PUSH_ANIMATION,
          animationDuration: motionDurations.enterStack,
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
            animation: MODAL_ANIMATION,
            animationDuration: motionDurations.enterModal,
            gestureEnabled: false,
            fullScreenGestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="add-expense"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: MODAL_ANIMATION,
            animationDuration: motionDurations.enterModal,
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="add-fixed-expense"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: MODAL_ANIMATION,
            animationDuration: motionDurations.enterModal,
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="household-setup"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: MODAL_ANIMATION,
            animationDuration: motionDurations.enterModal,
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="expense-filters"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: MODAL_ANIMATION,
            animationDuration: motionDurations.enterModal,
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="expense-categories"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: MODAL_ANIMATION,
            animationDuration: motionDurations.enterModal,
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="asistente"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: MODAL_ANIMATION,
            animationDuration: motionDurations.enterModal,
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="coach/[signalId]"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: MODAL_ANIMATION,
            animationDuration: motionDurations.enterModal,
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
        <Stack.Screen
          name="settings/asistente"
          options={{
            freezeOnBlur: true,
            fullScreenGestureEnabled: false,
          }}
        />
      </Stack>
    </>
  )
}
