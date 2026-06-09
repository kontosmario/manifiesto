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
// Skip window (5min):
//   La última verificación exitosa se guarda en un singleton in-memory
//   (no SecureStore — el skip es por SESSION, no across cold-starts).
//   Si la última reauth fue hace menos de `REAUTH_SKIP_WINDOW_MS`,
//   `requireReauth()` resuelve `true` sin abrir el sheet. Esto evita
//   doble fricción cuando el user encadena dos acciones destructivas
//   (e.g. eliminar meta → eliminar cuenta en el mismo flujo).
//
// Lockout (3 fallos → 30s):
//   El PinPad inside del sheet ya tiene su propio lockout exponencial
//   (manejado por `verifyPin()` en `pin-lock.ts`: 30s/1m/2m/4m/8m). El
//   hook NO duplica ese mecanismo — sólo expone el `lockedForMs` que
//   recibe del `verifyPin()` para que el sheet muestre el countdown.

import { useCallback, useRef, useState } from 'react'

const REAUTH_SKIP_WINDOW_MS = 5 * 60 * 1000

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
  /** Marca un reauth como "ya verificado" sin abrir el sheet — útil para
   *  flows que ya tienen su propio gate interno (e.g. delete-account
   *  screen tiene su flow de PIN/biometric custom y queremos honrar
   *  esa verificación en el skip window). */
  markVerified: () => void
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
  const lastVerifiedAtRef = useRef<number>(0)

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

  const markVerified = useCallback(() => {
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
