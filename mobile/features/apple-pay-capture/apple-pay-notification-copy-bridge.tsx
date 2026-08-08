import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { setNotificationCopy } from './native'

/**
 * Le pasa al módulo nativo el copy de la notificación local que dispara
 * el App Intent al capturar un pago, y lo mantiene sincronizado con el
 * idioma activo.
 *
 * Vive en la raíz (`root-layout-shell`, junto al resto de los bridges) y
 * NO en el layout de tabs: el intent corre con la app en background, y
 * `notify()` en Swift sale sin hacer nada si el copy todavía no fue
 * escrito. Colgado del layout de tabs, la primera captura de una
 * instalación nueva no notificaría hasta que el usuario entrara a la app.
 * Acá el copy queda escrito en el primer render de cada arranque, aún
 * antes del login.
 *
 * Las llaves `{amount}` y `{merchant}` del body las interpola Swift, no
 * i18next: por eso van con llave simple.
 */
export function ApplePayNotificationCopyBridge() {
  // Sólo `t` como dependencia: react-i18next devuelve un `t` nuevo cuando
  // cambia el idioma, así que alcanza para re-escribir el copy.
  const { t } = useTranslation()

  useEffect(() => {
    setNotificationCopy({
      title: t('gastos:applePay.notificationTitle'),
      bodyTemplate: t('gastos:applePay.notificationBody'),
    })
  }, [t])

  return null
}
