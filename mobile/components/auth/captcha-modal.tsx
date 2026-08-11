// Wrapper around `ConfirmHcaptcha` (default export of
// `@hcaptcha/react-native-hcaptcha`). Sprint B · B3.
//
// Why ConfirmHcaptcha and not the inner `Hcaptcha` (named export):
//   `ConfirmHcaptcha` ya viene con un Modal nativo + safe area + show/
//   hide imperativo, lo cual encaja bien con el patrón promise-resolver
//   que necesitamos. El inner `Hcaptcha` es solo el WebView raw — más
//   trabajo para igualar lo que el wrapper ya hace.
//
// Imperative API:
//   El upstream expone `show()` / `hide()` via React ref. Convertimos
//   eso al hook idiomático `useCaptcha()` que devuelve un
//   `request(): Promise<string | null>`. Este componente lee
//   `visible: boolean` y llama `show()` cuando flippa a true.
//
// Estados (`nativeEvent.data` upstream):
//   · 'open' / 'closed' — info, no resuelven
//   · 'cancel' / 'error' / 'expired' — null
//   · cualquier otro string → es el token

import { useEffect, useRef } from 'react'
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha'
import {
  HCAPTCHA_BASE_URL,
  HCAPTCHA_SITE_KEY,
  isCaptchaConfigured,
} from '@/lib/captcha-config'
import { withAlpha } from '@/theme/color-utils'
import { neoInk } from '@/theme/neo-ink'
import { neoTokens } from '@/theme/neo-tokens'
import { useThemeTokens } from '@/theme/theme-provider'

interface CaptchaModalProps {
  visible: boolean
  /** Llamado con el token cuando éxito, `null` cuando cancel/error/expired. */
  onComplete: (token: string | null) => void
}

/**
 * Misma alfa que el scrim de los sheets del sistema: el diseño lo dibuja
 * sólido, pero atrás hay una pantalla real y el sólido a opacidad plena
 * la borraría.
 *
 * El upstream usa este MISMO valor para dos cosas: el backdrop del Modal
 * y —al abrirse el desafío— el `background-color` del body del WebView
 * (Hcaptcha.js `onOpen`). Las dos capas se componen, así que durante el
 * desafío el velo queda casi sólido: es el extremo correcto del rango
 * (el scrim canónico ES sólido) y no hay forma de pasar valores
 * distintos por capa.
 */
const CAPTCHA_SCRIM_ALPHA = 0.84

const LIFECYCLE_NOOP = new Set(['open', 'closed'])
const LIFECYCLE_CANCEL = new Set(['cancel', 'error', 'expired'])

interface ConfirmHcaptchaHandle {
  show: () => void
  hide: () => void
}

// CR Sprint B #11: forwardRef + useImperativeHandle eliminados — el
// componente no expone API imperativa al caller. El hook useCaptcha
// maneja todo via props (visible + onComplete).
export function CaptchaModal({ visible, onComplete }: CaptchaModalProps) {
    const theme = useThemeTokens()
    const neo = neoTokens(theme.mode)
    const ink = neoInk(theme.mode)
    const captchaRef = useRef<ConfirmHcaptchaHandle | null>(null)
    const onCompleteRef = useRef(onComplete)
    useEffect(() => {
      onCompleteRef.current = onComplete
    }, [onComplete])

    // Defensa: si nos abren sin site key, salimos con null al toque.
    useEffect(() => {
      if (!visible) return
      if (!isCaptchaConfigured()) {
        if (__DEV__) {
          console.warn(
            '[captcha] EXPO_PUBLIC_HCAPTCHA_SITE_KEY no está configurada — saltando captcha. Configura la key en EAS secrets antes de submit a producción.',
          )
        }
        onCompleteRef.current(null)
        return
      }
      // Disparamos `show()` imperativo. El upstream maneja el Modal por
      // adentro; el `visible` que recibimos sólo gobierna cuándo
      // pedirle que aparezca.
      captchaRef.current?.show()
    }, [visible])

    const handleMessage = (event: { nativeEvent: { data: string } }) => {
      const data = event.nativeEvent?.data ?? ''
      if (LIFECYCLE_NOOP.has(data)) return
      if (LIFECYCLE_CANCEL.has(data)) {
        captchaRef.current?.hide()
        onCompleteRef.current(null)
        return
      }
      // Token de éxito.
      captchaRef.current?.hide()
      onCompleteRef.current(data)
    }

    if (!isCaptchaConfigured()) return null

    return (
      <ConfirmHcaptcha
        ref={(instance) => {
          captchaRef.current = instance as ConfirmHcaptchaHandle | null
        }}
        siteKey={HCAPTCHA_SITE_KEY}
        baseUrl={HCAPTCHA_BASE_URL}
        size="normal"
        theme={theme.mode === 'dark' ? 'dark' : 'light'}
        backgroundColor={withAlpha(neo.scrim, CAPTCHA_SCRIM_ALPHA)}
        loadingIndicatorColor={ink.accent}
        showLoading
        onMessage={handleMessage}
      />
    )
}
