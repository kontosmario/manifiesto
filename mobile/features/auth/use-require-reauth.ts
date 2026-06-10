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
// Sprint N · Audit #2 N1 / Audit #5 F-9 (2026-06-14): make proofs
// SINGLE-USE so a captured token can't be replayed.
//
// `ReauthProof` is an opaque branded type. The only way to obtain one
// is through `proofFromPinVerification()` or `proofFromBiometric()`
// below — both of which require evidence (a successful VerifyPinResult
// or a successful biometric outcome). Calling `markVerified()` without
// a proof is a compile-time error.
//
// Single-use enforcement: each proof factory mints a FRESH frozen
// object and registers it in a module-private WeakSet. `markVerified`
// validates the proof against the WeakSet AND removes it on use.
// Subsequent calls with the same proof reference fail the WeakSet
// check and are refused. The WeakSet uses weak references so unused
// proofs are garbage-collected automatically; we never leak memory.
//
// Why single-use:
//   The previous singleton (`const PROOF_TOKEN = Object.freeze({})`)
//   was a shared token: any code with access to the token could call
//   `markVerified` arbitrarily many times. A compromised module that
//   captured the token once could mint a permanent skip. Per-call
//   tokens close that hole — the proof exists for exactly one
//   consumption.
declare const ReauthProofBrand: unique symbol
export interface ReauthProof {
  readonly [ReauthProofBrand]: true
}

// Registry of unconsumed proofs. WeakSet so callers that drop the
// proof reference without using it don't leak memory: V8 will GC the
// frozen object and the WeakSet entry vanishes with it.
const issuedProofs: WeakSet<ReauthProof> = new WeakSet()

function mintProof(): ReauthProof {
  // `at` is included so the object isn't an empty `{}` (which V8 can
  // intern more aggressively). Each call produces a structurally
  // distinct object reference; the WeakSet keys on identity, not
  // value.
  const proof = Object.freeze({ at: Date.now() }) as unknown as ReauthProof
  issuedProofs.add(proof)
  return proof
}

/**
 * Build a single-use ReauthProof from a successful PIN verification.
 *
 * Pass the actual `VerifyPinResult` returned by `verifyPin()` — if
 * `result.ok === false`, this returns `null` and `markVerified` cannot
 * be called.
 *
 * The returned proof is consumed on the first `markVerified` call.
 * Calling `markVerified` again with the same reference is refused.
 */
export function proofFromPinVerification(
  result: { ok: boolean },
): ReauthProof | null {
  return result.ok ? mintProof() : null
}

/**
 * Build a single-use ReauthProof from a successful biometric challenge.
 *
 * Pass the actual `{ success }` from `authenticateBiometricAccess()` —
 * if `success === false`, returns `null`.
 *
 * The returned proof is consumed on the first `markVerified` call.
 */
export function proofFromBiometric(
  result: { success: boolean },
): ReauthProof | null {
  return result.success ? mintProof() : null
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
    // Sprint N: enforce single-use. The proof must be in the registry
    // of issued-but-unconsumed tokens. WeakSet.delete returns true iff
    // the entry existed and was removed — i.e. iff this is the proof's
    // first consumption. Any `as ReauthProof` cast at the call site
    // creates an object that was never in `issuedProofs`, so the check
    // fails. Replay (same reference passed twice) also fails because
    // the first call removed it.
    const consumed = issuedProofs.delete(proof)
    if (!consumed) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(
          '[useRequireReauth] markVerified called with invalid or already-consumed proof — refusing.',
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
