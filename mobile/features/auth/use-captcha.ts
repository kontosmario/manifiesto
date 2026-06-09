// Promise-resolver hook around the hCaptcha modal (sprint B · B3).
//
// Usage:
//   const captcha = useCaptcha()
//
//   const onSubmit = async () => {
//     const token = await captcha.request()
//     await supabase.auth.signUp({ ..., options: { captchaToken: token ?? undefined } })
//   }
//
//   return <>
//     ...
//     <CaptchaModal visible={captcha.visible} onComplete={captcha.onComplete} />
//   </>
//
// Si el captcha no está configurado (env vacío), `request()` resuelve
// `null` inmediatamente — el caller debe manejar ese caso o, si el
// flow es OK con bypass en dev, pasar `undefined` a Supabase y dejar
// que pase. En producción la key SIEMPRE va a estar cargada.

import { useCallback, useEffect, useRef, useState } from 'react'
import { isCaptchaConfigured } from '@/lib/captcha-config'

interface PendingCaptcha {
  resolve: (token: string | null) => void
}

interface UseCaptchaResult {
  /** Abre el widget y devuelve un token (null = cancel/error/sin-key). */
  request: () => Promise<string | null>
  /** Bind al `visible` del CaptchaModal. */
  visible: boolean
  /** Bind al `onComplete` del CaptchaModal. */
  onComplete: (token: string | null) => void
  /** Indica si la integración está configurada (env tiene site key). */
  isConfigured: boolean
}

export function useCaptcha(): UseCaptchaResult {
  const [visible, setVisible] = useState(false)
  const pendingRef = useRef<PendingCaptcha | null>(null)

  const request = useCallback((): Promise<string | null> => {
    if (!isCaptchaConfigured()) {
      // Dev / staging sin key configurada — bypass directo.
      return Promise.resolve(null)
    }
    return new Promise<string | null>((resolve) => {
      pendingRef.current = { resolve }
      setVisible(true)
    })
  }, [])

  const onComplete = useCallback((token: string | null) => {
    setVisible(false)
    const pending = pendingRef.current
    pendingRef.current = null
    pending?.resolve(token)
  }, [])

  // CR Sprint B #5: si el component unmonta con un pending captcha
  // (deep-link, back-nav forzado), resolvé con null para que el
  // await no quede colgado y el caller pueda destrabar su loading state.
  useEffect(() => {
    return () => {
      const pending = pendingRef.current
      pendingRef.current = null
      pending?.resolve(null)
    }
  }, [])

  return {
    request,
    visible,
    onComplete,
    isConfigured: isCaptchaConfigured(),
  }
}
