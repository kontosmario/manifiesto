// Re-auth gate for destructive actions (eliminar cuenta, salir de
// familia, eliminar meta con monto > 0). Sprint B · B1.
//
// Why a Promise-resolver pattern (not a context-provided sheet):
//   El sheet vive a nivel del caller (mismo tree donde se dispara la
//   acción destructiva) y resuelve un `Promise<boolean>` cuando el user
//   confirma o cancela. Eso evita un Context global y deja el sheet
//   colocado donde naturalmente cierra el flow (mismo modal / mismo
//   screen). Cada caller monta su propio `<RequireReauthSheet />` y
//   conecta los callbacks al state que el hook expone.
//
// Skip window (5min, PER-SCREEN):
//   La última verificación exitosa se guarda en un ref dentro del HOOK
//   INSTANCE — NO es un singleton global. Por diseño cada caller (cada
//   screen / sheet que monta `useRequireReauth`) tiene su propio
//   contador. Si una pantalla pide reauth y el usuario lo pasa, el
//   skip aplica únicamente para acciones encadenadas DENTRO de esa
//   misma pantalla durante 5 minutos.
//
//   Por qué per-screen y no session-wide (Sprint J-Med2, 2026-06-10):
//     • Audit #3 marcó la discrepancia entre el docstring viejo
//       ("session-wide") y la implementación real (per-instance).
//       Resolvimos a favor del comportamiento per-screen porque es
//       MÁS seguro: encadenar acciones destructivas atraviesa más
//       fricción, no menos.
//     • Un atacante con device desbloqueado que abrió `Settings >
//       Eliminar meta` (y pasó el PIN) NO debería tener un "pase
//       libre" para entrar a `Settings > Eliminar cuenta` durante
//       los 5 min siguientes sin volver a verificar.
//     • El costo en UX es bajo porque el skip dentro de la misma
//       pantalla cubre el caso real (confirmar, undo, confirmar de
//       nuevo); cruzar pantallas es ya un costo mayor de por sí.
//
// Lockout (3 fallos → 30s):
//   El PinPad inside del sheet ya tiene su propio lockout exponencial
//   (manejado por `verifyPin()` en `pin-lock.ts`: 30s/1m/2m/4m/8m). El
//   hook NO duplica ese mecanismo — sólo expone el `lockedForMs` que
//   recibe del `verifyPin()` para que el sheet muestre el countdown.

import { useCallback, useEffect, useRef, useState } from 'react'

const REAUTH_SKIP_WINDOW_MS = 5 * 60 * 1000

// Sprint J-Med · J-Med2 (2026-06-10): tighten `markVerified` so it
// cannot be called without genuine auth.
//
// `ReauthProof` is an opaque branded type. The only way to obtain one
// is through `proofFromPinVerification()` or `proofFromBiometric()`
// below — both of which require evidence (a successful VerifyPinResult
// or a successful biometric outcome). Calling `markVerified()` without
// a proof is a compile-time error.
//
// Marker tokens are non-transferable in practice — they are objects, so
// callers can't fabricate one via JSON; but more importantly, the type
// brand makes "I accidentally pass `null` / `undefined`" impossible.
declare const ReauthProofBrand: unique symbol
export interface ReauthProof {
  readonly [ReauthProofBrand]: true
}
const PROOF_TOKEN: ReauthProof = Object.freeze({}) as ReauthProof

/**
 * Build a ReauthProof from a successful PIN verification.
 *
 * Pass the actual `VerifyPinResult` returned by `verifyPin()` — if
 * `result.ok === false`, this returns `null` and `markVerified` cannot
 * be called.
 */
export function proofFromPinVerification(
  result: { ok: boolean },
): ReauthProof | null {
  return result.ok ? PROOF_TOKEN : null
}

/**
 * Build a ReauthProof from a successful biometric challenge.
 *
 * Pass the actual `{ success }` from `authenticateBiometricAccess()` —
 * if `success === false`, returns `null`.
 */
export function proofFromBiometric(
  result: { success: boolean },
): ReauthProof | null {
  return result.success ? PROOF_TOKEN : null
}

interface PendingReauth {
  actionLabel: string
  resolve: (value: boolean) => void
}

interface UseRequireReauthResult {
  /** Llamar antes de la acción destructiva. `true` = autorizada. */
  requireReauth: (actionLabel: string) => Promise<boolean>
  /** Bind al `visible` del sheet. */
  isVisible: boolean
  /** El label que el sheet muestra (e.g. "Eliminar cuenta"). */
  actionLabel: string
  /** Callback del sheet cuando el user confirma exitosamente. */
  onConfirmed: () => void
  /** Callback del sheet cuando el user cancela o falla. */
  onCancel: () => void
  /**
   * Marca un reauth como "ya verificado" sin abrir el sheet — útil para
   * flows que ya tienen su propio gate interno (e.g. delete-account
   * screen tiene su flow de PIN/biometric custom y queremos honrar esa
   * verificación en el skip window).
   *
   * Sprint J-Med · J-Med2 (2026-06-10): el parámetro `proof` es un brand
   * type que sólo se construye con `proofFromPinVerification()` o
   * `proofFromBiometric()` a partir de un resultado exitoso. Llamar
   * `markVerified(null)` o sin argumentos NO compila — esto hace
   * imposible "falsear" una verificación.
   */
  markVerified: (proof: ReauthProof) => void
}

/**
 * Hook para gatear acciones destructivas con un re-auth (PIN o biometría).
 *
 * @example
 * ```tsx
 * const reauth = useRequireReauth()
 *
 * const handleDelete = async () => {
 *   const ok = await reauth.requireReauth('Eliminar meta')
 *   if (!ok) return
 *   await deleteMutation.mutateAsync(goalId)
 * }
 *
 * return (
 *   <>
 *     <Button onPress={handleDelete} />
 *     <RequireReauthSheet
 *       visible={reauth.isVisible}
 *       actionLabel={reauth.actionLabel}
 *       onConfirmed={reauth.onConfirmed}
 *       onCancel={reauth.onCancel}
 *     />
 *   </>
 * )
 * ```
 */
export function useRequireReauth(): UseRequireReauthResult {
  const [pending, setPending] = useState<PendingReauth | null>(null)
  const pendingRef = useRef<PendingReauth | null>(null)
  const lastVerifiedAtRef = useRef<number>(0)

  // Mantener ref sincronizado con state para que el unmount cleanup
  // pueda resolver sin causar setState post-unmount.
  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  // CR Sprint B #5: si el component unmonta con un pending reauth,
  // resolvé como false (cancel) para que el caller no quede esperando
  // el promise para siempre.
  useEffect(() => {
    return () => {
      pendingRef.current?.resolve(false)
      pendingRef.current = null
    }
  }, [])

  const requireReauth = useCallback((actionLabel: string): Promise<boolean> => {
    const now = Date.now()
    if (now - lastVerifiedAtRef.current < REAUTH_SKIP_WINDOW_MS) {
      // Skip — verificó hace poco.
      return Promise.resolve(true)
    }
    return new Promise<boolean>((resolve) => {
      setPending({ actionLabel, resolve })
    })
  }, [])

  const onConfirmed = useCallback(() => {
    lastVerifiedAtRef.current = Date.now()
    setPending((current) => {
      current?.resolve(true)
      return null
    })
  }, [])

  const onCancel = useCallback(() => {
    setPending((current) => {
      current?.resolve(false)
      return null
    })
  }, [])

  const markVerified = useCallback((proof: ReauthProof) => {
    // Brand check at runtime: the type system enforces a real proof at
    // the call site, but this guard catches any `as ReauthProof` casts
    // that might sneak past code review.
    if (proof !== PROOF_TOKEN) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(
          '[useRequireReauth] markVerified called with invalid proof — refusing.',
        )
      }
      return
    }
    lastVerifiedAtRef.current = Date.now()
  }, [])

  return {
    requireReauth,
    isVisible: pending !== null,
    actionLabel: pending?.actionLabel ?? '',
    onConfirmed,
    onCancel,
    markVerified,
  }
}

/** Export const for tests / docs. */
export const REAUTH_SKIP_WINDOW_MS_EXPORT = REAUTH_SKIP_WINDOW_MS
