import { useCallback, useEffect, useRef, useState } from 'react'
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
 * El estado del rate limit vive sólo en memoria; cierra app y resetea.
 * Si el usuario quiere abusar de verdad, Supabase ya tiene su propio
 * límite server-side (1 email por minuto por dirección).
 */

const DEFAULT_COOLDOWN_MS = 60_000
const RATE_LIMIT_WINDOW_MS = 5 * 60_000
const MAX_SENDS_PER_WINDOW = 3

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

  const sendTimestampsRef = useRef<number[]>([])
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

  const purgeOldTimestamps = useCallback(() => {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS
    sendTimestampsRef.current = sendTimestampsRef.current.filter(
      (ts) => ts > cutoff,
    )
  }, [])

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
      purgeOldTimestamps()
      if (sendTimestampsRef.current.length >= MAX_SENDS_PER_WINDOW) {
        setError(
          'Esperá unos minutos antes de pedir otro email. Ya enviamos varios.',
        )
        return
      }
      try {
        await mutation.mutateAsync({ email })
        sendTimestampsRef.current = [...sendTimestampsRef.current, Date.now()]
        setCooldownUntil(Date.now() + cooldownMs)
        setNow(Date.now())
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'No pudimos reenviar el email. Intentá de nuevo.',
        )
      }
    },
    [cooldownMs, cooldownUntil, mutation, purgeOldTimestamps],
  )

  const startCooldown = useCallback(() => {
    setCooldownUntil(Date.now() + cooldownMs)
    setNow(Date.now())
  }, [cooldownMs])

  const secondsUntilRetry = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
  purgeOldTimestamps()
  const rateLimited = sendTimestampsRef.current.length >= MAX_SENDS_PER_WINDOW

  return {
    resend,
    isPending: mutation.isPending,
    error,
    secondsUntilRetry,
    rateLimited,
    startCooldown,
  }
}
