import { useEffect } from 'react'
import { Platform } from 'react-native'
import { Stack } from 'expo-router'
import { useAppTheme } from '@/theme/theme-provider'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { AchievementUnlockBridge } from '@/components/bridges/achievement-unlock-bridge'
import { WeekCloseBridge } from '@/components/garden/week-close-bridge'
import { CycleWrappedBridge } from '@/components/bridges/cycle-wrapped-bridge'
import { ToastHost } from '@/components/ui/toast-host'
import { NoSpendConfettiHost } from '@/components/ui/no-spend-confetti-host'
import { DailyBudgetNudgeBridge } from '@/components/bridges/daily-budget-nudge-bridge'
import { GlobalSettingsModalsHost } from '@/components/settings/global-settings-modals-host'
import { GlobalAdvisorActionHost } from '@/components/control-v2/global-advisor-action-host'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useLastUserProfileSync } from '@/features/auth/use-last-user-profile-sync'
import { useTimezoneSync } from '@/features/auth/use-timezone-sync'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { useAdvisorDismissalsSync } from '@/features/insights/control-dismiss-store'
import { useRegisterPushToken } from '@/features/push/use-register-push-token'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { verifyInternetReachable } from '@/lib/verify-internet-reachable'
import { dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'
import { motionDurations } from '@/lib/motion'
import { withStackDevLog } from '@/lib/dev/anim-log'

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

// DEV-only: loguea focus/blur + frames de las pantallas de STACK (settings,
// asistente, modales, (tabs)) para ver las transiciones que el logger de
// tabs no captura. No-op en release.
const STACK_DEV_LISTENERS = withStackDevLog({})

export function AppStackShell() {
  // Theme se lee acá para inyectar `contentStyle.backgroundColor` en el
  // Stack — cierra el white flash entre push/pop screens en dark mode
  // (native-stack default es blanco en el screen content container,
  // visible durante el slide).
  const { theme } = useAppTheme()
  // Fire the single snapshot RPC at the app-shell level, before any
  // screen or bridge mounts. The RPC seeds every downstream cache
  // (profile, family, expenses, fixed_expenses, family_finance, etc.),
  // so hooks below read from cache and skip their own network calls.
  const session = useAuthSession()
  const userId = session.data?.user.id
  const snapshot = useHomeSnapshot(userId)
  const isOnline = useOnlineStatus()
  // Mirror the active user's email + display name + avatar to a
  // SecureStore-backed cache so the login screen can show a
  // personalized hero on next launch.
  useLastUserProfileSync()
  // Keep `profiles.timezone` aligned with the device's IANA TZ. The
  // streak trigger reads that column to decide which calendar day an
  // expense belongs to, so this sync is what makes the per-user day
  // boundary work in practice (instead of a hardcoded BA default).
  useTimezoneSync()

  // Hydrate the advisor-dismiss cache once familyId + userId are
  // known. This server-side store replaces the previous SecureStore-
  // backed dismissals — see `control-dismiss-store.ts` for details.
  // Mounted up here (BEFORE the conditional `BlockingScreenView`
  // return) so the hook order stays stable across renders. The hook
  // itself no-ops while either id is null.
  useAdvisorDismissalsSync({
    familyId: snapshot.data?.family?.familyId ?? null,
    userId: userId ?? null,
  })

  // Auto-registrar el token Expo Push del device cuando hay session
  // activa y el OS permission ya fue concedido. No-op si:
  //   - Build no soporta push (web, Expo Go, simulador)
  //   - El user nunca aceptó el permiso (el priming/Settings lo manejan)
  // Re-corre cuando cambia familyId para llevar la columna al día.
  useRegisterPushToken(userId ?? null, snapshot.data?.family?.familyId ?? null)

  // Bridge home_snapshot errors a la máquina auth-flow: si un viaje
  // está en `bridging` esperando el destino, el LOAD_FAILED muestra el
  // fallback de error con Reintentar. Fuera de bridging la máquina lo
  // ignora (no-op) — un refetch fallido en background no debe tapar la
  // app; el takeover offline global lo maneja GlobalConnectivityWatcher.
  useEffect(() => {
    if (!snapshot.isError) return

    const classifyByMessage = (): 'network' | 'unknown' => {
      const message = String(snapshot.error?.message ?? '').toLowerCase()
      return message.includes('network') || message.includes('fetch') ? 'network' : 'unknown'
    }

    if (!isOnline) {
      // NetInfo dice offline — pero puede ser un snapshot STALE al resumir
      // (la radio recién despierta). Verificamos de verdad antes de surfacear
      // "Sin conexión": si hay internet real, el error NO es de red →
      // clasificamos por el mensaje. Mismo criterio que GlobalConnectivityWatcher
      // para que la vista solo aparezca cuando realmente no hay conexión.
      let cancelled = false
      void verifyInternetReachable().then((reachable) => {
        if (cancelled) return
        dispatchAuthFlow({
          type: 'LOAD_FAILED',
          kind: reachable ? classifyByMessage() : 'network',
        })
      })
      return () => {
        cancelled = true
      }
    }

    dispatchAuthFlow({ type: 'LOAD_FAILED', kind: classifyByMessage() })
  }, [snapshot.isError, snapshot.error, isOnline])

  // If the user is authenticated, block the whole app tree until the
  // snapshot is seeded. Everything downstream (RequireAuth, tabs,
  // bridges) then mounts against a hot cache and issues zero extra
  // requests. Unauthenticated users pass through immediately —
  // RequireAuth below will redirect them to /(auth)/login.
  if (userId && !snapshot.data && !snapshot.isError) {
    return <BlockingScreenView message="Preparando tu espacio..." />
  }

  // The global host is only useful once we know who the user is and
  // which family they belong to. The snapshot resolves both before we
  // render the stack (the BlockingScreenView above gates that), so by
  // this point both ids are stable.
  const familyId = snapshot.data?.family?.familyId ?? null

  return (
    <>
      <DailyBudgetNudgeBridge />
      {userId && familyId ? (
        <>
          <GlobalSettingsModalsHost familyId={familyId} userId={userId} />
          <GlobalAdvisorActionHost familyId={familyId} userId={userId} />
          <AchievementUnlockBridge userId={userId} />
          <WeekCloseBridge familyId={familyId} userId={userId} />
          <CycleWrappedBridge />
          <ToastHost />
          <NoSpendConfettiHost />
        </>
      ) : null}
      <Stack
        screenListeners={STACK_DEV_LISTENERS}
        screenOptions={{
          headerShown: false,
          animation: STACK_PUSH_ANIMATION,
          animationDuration: motionDurations.enterStack,
          animationMatchesGesture: true,
          freezeOnBlur: true,
          fullScreenGestureEnabled: false,
          gestureEnabled: true,
          // Closes the white flash that was visible during stack
          // push/pop in dark mode. Native-stack's screen content
          // container defaults to white on iOS/Android; during the
          // slide animation, the parent (this content container) is
          // revealed for a frame as the outgoing screen exits and the
          // incoming screen enters. Without an explicit theme-aware
          // background, that frame shows white-on-dark on dark theme.
          // Canvas match con `ThemedRoot` outer para que NO haya seam
          // entre capas (root → stack → screen).
          contentStyle: { backgroundColor: theme.colors.canvas },
        }}
      >
        {/* The `(tabs)` group is the first screen pushed onto this
            stack right after login (AppEntryGate redirects here once
            session+family resolve). The push transition fires while
            the warm splash is still fully opaque on top — animating
            it is wasted UI-thread work that contests the splash's
            worklets (~280ms of native push animation overlapping
            with snapshot RPC processing + tabs tree mounting at the
            same wall-clock moment). Setting `animation: 'none'`
            makes the push instant; the splash handles all the
            visual transition work itself. Pure-navigation pushes to
            `/(tabs)` after login (and any internal swap) become
            free UI-thread work. */}
        {/* freezeOnBlur: false SOLO acá (override del global true). Con
            freezeOnBlur, al pushear una pantalla de Settings (card full-screen)
            el screen (tabs) se congela vía react-freeze + react-native-screens
            lo desconecta; al volver, Reanimated sigue avanzando los shared
            values pero escribe a un view tag inválido → TODAS las animaciones
            de los tabs quedan congeladas hasta reiniciar la app (confirmado:
            withRepeat sigue corriendo pero las views no actualizan). Mantener
            (tabs) sin freeze preserva el binding de las views. Trade-off: los
            tabs siguen vivos bajo Settings (costo de GPU menor mientras estás
            en una sub-pantalla), aceptable vs el freeze permanente. */}
        <Stack.Screen
          name="(tabs)"
          options={{ animation: 'none', freezeOnBlur: false }}
        />
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
          name="onboarding-success"
          options={{
            // El wizard (onboarding) es un modal; success es el destino al
            // terminar. Un `fade` hace que success CRUCE suave sobre el wizard
            // (crossfade) en vez del modal-dismiss (slide-down) + card-push,
            // que se leía como un salto/parpadeo hacia atrás. Combinado con
            // quitar el replace imperativo redundante en el orquestador (el
            // gate redirige una sola vez), la transición queda limpia.
            animation: 'fade',
            animationDuration: motionDurations.enterModal,
            gestureEnabled: false,
            fullScreenGestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="trial-welcome"
          options={{
            gestureEnabled: false,
            fullScreenGestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="biometric-setup"
          options={{
            gestureEnabled: false,
            fullScreenGestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="pin-setup"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            gestureEnabled: true,
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
          name="add-income"
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
        <Stack.Screen
          name="settings/plan"
          options={{
            freezeOnBlur: true,
            fullScreenGestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="settings/about"
          options={{
            freezeOnBlur: true,
            fullScreenGestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="settings/delete-account"
          options={{
            freezeOnBlur: true,
            fullScreenGestureEnabled: false,
          }}
        />
      </Stack>
    </>
  )
}
