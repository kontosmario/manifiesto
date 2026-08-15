import { NeoConfirmHost } from '@/components/ui/neo-confirm-host'
import { ToastHost } from '@/components/ui/toast-host'

/**
 * Par de hosts de overlay (confirmación + toast) para una TOMA DE
 * PANTALLA MODAL: una superficie montada dentro de un `<Modal>` nativo,
 * como el gate de suscripción o la baja de cuenta anidada.
 *
 * Por qué hace falta repetirlos ahí adentro: en iOS un `<Modal>` es una
 * presentación de UIKit por encima de TODO el árbol React de la app. Los
 * hosts de la raíz (`app-stack-shell`) siguen montados, pero dibujan
 * debajo de esa ventana, y presentar un segundo `<Modal>` desde el mismo
 * view controller lo descarta iOS en silencio — sin error y sin log (ver
 * el docblock de `modal-visibility.ts`). Resultado: la pregunta o el
 * aviso existen en memoria y son invisibles.
 *
 * Los buses entregan al host MÁS INTERNO (el último suscripto), así que
 * montar este par dentro del modal alcanza: mientras viva, se lleva las
 * confirmaciones y los toasts; al desmontarse, vuelven a la raíz. No
 * agrega nada cuando no hay nada que mostrar (ambos hosts renderean
 * `null` sin pedido vivo).
 *
 * Montarlo como ÚLTIMO hermano dentro del modal: sus capas son absolutas
 * y tienen que pintar encima del contenido.
 */
export function OverlayHosts() {
  return (
    <>
      <NeoConfirmHost />
      <ToastHost />
    </>
  )
}
