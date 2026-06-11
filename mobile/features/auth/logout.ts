export async function logoutSession(input: {
  onError: (error: unknown) => void
  onSuccess: () => void
}) {
  const { clearBiometricCredentials } = await import('@/lib/biometric-auth')
  const { supabase } = await import('@/lib/supabase')
  const { resetAppLock } = await import('@/features/auth/app-lock-state')
  const { clearLastUserProfile } = await import('@/lib/last-user-cache')
  const { resetAllTours } = await import('@/features/tours/persistence')
  const { clearAllTourPending } = await import('@/features/tours/tour-pending-store')
  const { deletePersistentValue } = await import('@/lib/persistent-kv')
  const { clearBiometricSetupShown } = await import(
    '@/features/auth/biometric-setup-flag'
  )
  const { clearPendingNotificationRoute } = await import(
    '@/lib/notification-pending-route'
  )
  const { clearPin } = await import('@/lib/pin-lock')
  const { clearProtectionPromptDismissal } = await import(
    '@/features/auth/protection-prompt-dismissal'
  )

  // Capture userId BEFORE signOut so we can namespace the per-user
  // flag clear. After signOut the session is null and we'd lose
  // the ability to target the right key.
  const sessionResponse = await supabase.auth.getSession()
  const userId = sessionResponse.data.session?.user.id ?? null

  // ─── Phase 1: pre-signOut cleanup (still has JWT) ──────────────
  //
  // Sprint J · J-Mobile1 — Borrar el token Expo Push del backend ANTES
  // de signOut(). El DELETE necesita el JWT del usuario para pasar RLS
  // (`auth.uid() = user_id`); si lo corremos después de signOut, la
  // request va anónima → RLS rechaza → encolamos retry → al próximo
  // login (otro user) el retry tampoco matchea RLS → no-op silencioso.
  // best-effort: si falla, no bloqueamos el logout (queda encolado
  // para retry en el próximo cold start vía flushPendingPushTokenCleanup).
  if (userId) {
    const { tearDownPushNotifications } = await import('@/lib/push-notifications')
    try {
      await tearDownPushNotifications(userId)
    } catch {
      // best-effort
    }
  }

  // ─── Phase 2: clear ALL device-local state BEFORE signOut ──────
  //
  // CRITICAL ORDER: el `signOut()` dispara el SIGNED_OUT event de
  // Supabase que cascada a `useAuthSession` → `sessionUserId` → null →
  // `useColdStartBiometricCheck` re-prueba SecureStore → `AppEntryGate`
  // decide ruta. Si el Keychain (biometric credentials) o el cache de
  // last-user todavía tienen datos del user anterior cuando el SIGNED_OUT
  // dispara, AppEntryGate piensa "este device tiene biometrics → redirect
  // a /login?autoBiometric=1" → Face ID prompt dispara → ❌ bug.
  //
  // Hasta 2026-06-11 los clears corrían DESPUÉS de signOut, lo que
  // creaba esa ventana de race. La fix es hacer signOut LAST de Phase 3
  // así cuando el evento dispara, todo el state local ya está limpio.
  //
  // Parallelize los clears para minimizar el tiempo total de la fase
  // (cada uno toca un store distinto, sin dependencies cruzadas).
  await Promise.all([
    clearBiometricCredentials(),
    clearPin(),
    clearLastUserProfile(),
    // Tours device-local cleanup:
    //   • `resetAllTours()` clears only `tours-disabled` (the per-user
    //     "seen" flags moved to backend on 2026-05-27; backend persists
    //     across sessions/devices, so we don't touch them on logout)
    //   • `clearAllTourPending()` wipes every `tour-seen-pending.<key>`.
    //     Critical: without this, a pending flag from user A would be
    //     drained on user B's next launch under user B's auth.uid(),
    //     marking user B as having seen a tour they never saw.
    //   • `tour-seen.migration-v2-done` is cleared so the one-shot
    //     legacy migration re-evaluates against the next user's device
    //     state (e.g. iCloud restore of SecureStore left flags from
    //     another install)
    //   • `tours-backfill-done` was the pre-2026-05-27 device-local
    //     backfill flag; we delete it defensively in case of leftover
    //     residuals from a stale install
    resetAllTours(),
    clearAllTourPending(),
    deletePersistentValue('tour-seen.migration-v2-done'),
    deletePersistentValue('tours-backfill-done'),
    // Pre-onboarding biometric-setup flag (per-user). If the user
    // signed out mid-onboarding without seeing the screen, they should
    // see it again on the next login.
    userId ? clearBiometricSetupShown(userId) : Promise.resolve(),
    // Sprint R-3 · R-3.2 — clear the "Configurá Face ID o PIN"
    // dismissal stamp so the next sign-in (same or different user)
    // re-evaluates fresh. Without this, a user who dismissed the
    // banner yesterday and logs out / back in today would skip the
    // recommendation for up to 24h on the new session.
    userId ? clearProtectionPromptDismissal(userId) : Promise.resolve(),
  ])

  // Sprint L · Audit #5 L-2 (2026-06-10): clear any pending push-tap
  // route BEFORE `resetAppLock()` so the next unlock (post-login on a
  // shared device) cannot drain user A's queued deep link into user B's
  // session. Must run pre-`resetAppLock()` because that call eventually
  // triggers an unlock transition, and the bridge listens for the
  // locked→unlocked edge to flush pendingRoute.
  clearPendingNotificationRoute()

  // Re-arm the app-lock gate so the next session (if a different
  // user signs in on the same device, or the same user signs back
  // in) goes through the biometric re-confirmation again.
  resetAppLock()

  // Reset de la máquina auth-flow → `guest`. Sin esto la máquina queda
  // en `ready` y el próximo LOGIN_PENDING (re-login del mismo u otro
  // user) sería un no-op — el bridge nunca aparecería.
  const { dispatchAuthFlow } = await import('@/features/auth-flow/auth-flow-controller')
  dispatchAuthFlow({ type: 'LOGOUT' })

  // ─── Phase 3: signOut LAST — fires SIGNED_OUT with clean state ─
  //
  // En este punto Keychain está limpio, last-user cache vacío, app-lock
  // re-armado, pending notification route limpio. Cuando Supabase fire
  // SIGNED_OUT, AppEntryGate va a re-probar y va a ver `shouldUseBiometric
  // = false` → redirect a `/(auth)/welcome` directamente, sin Face ID.
  const { error } = await supabase.auth.signOut()

  if (error) {
    input.onError(error)
    return
  }

  input.onSuccess()
}
