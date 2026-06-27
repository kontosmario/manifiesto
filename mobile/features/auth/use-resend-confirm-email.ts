import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getEmailRedirectTo } from '@/features/auth/auth-flow'

/**
 * Resend del email de confirmación de signup.
 *
 * Capas de protección:
 *   1) Cooldown corto entre envíos (default 60s) — el caller decide
 *      cuándo arrancarlo y vemos `secondsUntilRetry` para el countdown.
 *   2) Rate limit duro: máximo `MAX_SENDS_PER_WINDOW` envíos exitosos
 *      dentro de `RATE_LIMIT_WINDOW_MS`. Esto es client-side y
 *      complementa el rate-limit de Supabase Auth — útil para evitar
 *      que un usuario martille el botón si el countdown UI fallara.
 *
 * El estado del rate limit vive a NIVEL MÓDULO (no por instancia del
 * hook) — CR Sprint A finding #4. Antes era `useRef` y se reseteaba al
 * unmount → usuario navegando signup ↔ forgot-password evadía el límite.
 * Ahora persiste durante toda la vida del app process. Si cierra el app,
 * resetea (Supabase server-side rate-limit toma la posta).
 */

const DEFAULT_COOLDOWN_MS = 60_000
const RATE_LIMIT_WINDOW_MS = 5 * 60_000
const MAX_SENDS_PER_WINDOW = 3

// Singleton al módulo — sobrevive remounts del hook. Ver doc-comment.
const sendTimestamps: number[] = []
function purgeOldSendTimestamps(): void {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS
  for (let i = sendTimestamps.length - 1; i >= 0; i--) {
    if (sendTimestamps[i]! <= cutoff) sendTimestamps.splice(i, 1)
  }
}

export interface UseResendConfirmEmailResult {
  resend: (email: string) => Promise<void>
  isPending: boolean
  error: string | null
  /** Segundos hasta que el botón de reenvío se vuelva a habilitar. 0 = listo. */
  secondsUntilRetry: number
  /** True si el rate limit local se agotó (3 envíos en 5 min). */
  rateLimited: boolean
  /**
   * Arranca el cooldown sin disparar un nuevo envío. Útil cuando el
   * email original ya salió (ej: post-signup) y sólo queremos
   * bloquear el botón de reenvío durante los siguientes 60s.
   */
  startCooldown: () => void
}

interface UseResendConfirmEmailOptions {
  cooldownMs?: number
}

export function useResendConfirmEmail(
  options: UseResendConfirmEmailOptions = {},
): UseResendConfirmEmailResult {
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const { t } = useTranslation()

  const [cooldownUntil, setCooldownUntil] = useState<number>(0)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  // Tick para refrescar el countdown visible mientras el cooldown está
  // activo. Sólo arrancamos el interval cuando hay un cooldown vigente
  // para no quemar batería.
  useEffect(() => {
    if (cooldownUntil <= now) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [cooldownUntil, now])

  const mutation = useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { error: supabaseError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: getEmailRedirectTo(),
        },
      })
      if (supabaseError) {
        throw supabaseError
      }
    },
  })

  const resend = useCallback(
    async (email: string) => {
      setError(null)
      const nowMs = Date.now()
      if (cooldownUntil > nowMs) {
        return
      }
      purgeOldSendTimestamps()
      if (sendTimestamps.length >= MAX_SENDS_PER_WINDOW) {
        setError(t('auth:errors.resendRateLimited'))
        return
      }
      try {
        await mutation.mutateAsync({ email })
        sendTimestamps.push(Date.now())
        setCooldownUntil(Date.now() + cooldownMs)
        setNow(Date.now())
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('auth:errors.resendFailed'),
        )
      }
    },
    [cooldownMs, cooldownUntil, mutation, t],
  )

  const startCooldown = useCallback(() => {
    setCooldownUntil(Date.now() + cooldownMs)
    setNow(Date.now())
  }, [cooldownMs])

  const secondsUntilRetry = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
  purgeOldSendTimestamps()
  const rateLimited = sendTimestamps.length >= MAX_SENDS_PER_WINDOW

  return {
    resend,
    isPending: mutation.isPending,
    error,
    secondsUntilRetry,
    rateLimited,
    startCooldown,
  }
}
