import { useCallback, useMemo, useRef, useState } from 'react'
import { InteractionManager } from 'react-native'
import { ImportReviewSheet } from '@/components/import-review/import-review-sheet'
import { useApplePayCaptureEnabled } from '@/features/apple-pay-capture/apple-pay-enabled-store'
import { recordApplePayCaptures } from '@/features/apple-pay-capture/apple-pay-last-capture-store'
import { capturesToClear } from '@/features/apple-pay-capture/captures-to-clear'
import { mapCapturesToReviewRows } from '@/features/apple-pay-capture/map-captures-to-review-rows'
import { clearCaptures, isApplePayCaptureSupported } from '@/features/apple-pay-capture/native'
import { useApplePayCaptureGate } from '@/features/apple-pay-capture/use-apple-pay-capture-gate'
import type { PendingCapture } from '@/features/apple-pay-capture/types'
import { useExpenses } from '@/features/expenses/use-expenses'
import { formatISO } from '@/features/import-review/cycle-date-math'
import { useConfirmImport } from '@/features/import-review/use-confirm-import'
import { useImportWizardContext } from '@/features/import-review/use-import-wizard-context'
import type { ConfirmResult, ReviewRow, ReviewState } from '@/features/import-review/types'

/**
 * Host de la captura de Apple Pay. Vive en el layout de tabs (sólo existe
 * con sesión y app desbloqueada) y es dueño de SU instancia del sheet —
 * el share-import y el FAB conservan las suyas, no comparten estado.
 *
 * El wrapper no hace más que resolver los dos gates estáticos (build con
 * el módulo nativo + flag prendido). Todo el trabajo real —queries del
 * historial, gate de auth, suscripción a `AppState`— vive en el cuerpo,
 * que no se monta si la feature está apagada: así el usuario que nunca la
 * prendió no paga ni un fetch ni un listener.
 */
export function ApplePayCaptureHost() {
  const { enabled } = useApplePayCaptureEnabled()

  if (!enabled || !isApplePayCaptureSupported()) return null

  return <ApplePayCaptureBody />
}

function ApplePayCaptureBody() {
  const { familyId, userId } = useImportWizardContext()
  const [reviewState, setReviewState] = useState<ReviewState | null>(null)
  const [draining, setDraining] = useState<string[]>([])
  // Historial COMPLETO de la familia, no el feed reciente: la sugerencia
  // de categoría busca el último gasto del mismo comercio, y con las 3
  // filas del feed prácticamente nunca habría match. La key es la misma
  // que ya consumen Home, Control, el jardín y las rachas, así que en la
  // práctica sale del cache caliente y no agrega un round-trip.
  const expensesQuery = useExpenses(familyId)
  const confirmToDb = useConfirmImport({ familyId: familyId ?? '', userId: userId ?? '' })

  // `draining` cuenta como ocupado: entre que el gate entrega la tanda y
  // que el sheet se hace visible hay un `runAfterInteractions` de por
  // medio, y sin esto un segundo drenaje en esa ventana pisaría la tanda.
  const busy = reviewState !== null || draining.length > 0

  const history = useMemo(
    () =>
      (expensesQuery.data ?? []).map((expense) => ({
        description: expense.description,
        categoryId: expense.category_id,
        createdAt: expense.created_at,
      })),
    [expensesQuery.data],
  )
  // El historial viaja por REF, no por dependencia. Con `history` en las
  // deps de `handleCaptures`, el gate se re-creaba en cada cambio de
  // `useExpenses` y su efecto volvía a drenar: cualquier alta de gasto
  // —propia, de otro miembro por realtime, o la invalidación que dispara
  // el propio import— re-abría la hoja encima de lo que el usuario
  // estuviera haciendo. El comentario de `use-apple-pay-capture-gate`
  // prometía "en la próxima vuelta a foreground" y esto lo cumple.
  //
  // Leer `.current` dentro del callback no pierde frescura: se lee en el
  // momento del drenaje, que es cuando la sugerencia de categoría se
  // resuelve.
  const historyRef = useRef(history)
  historyRef.current = history

  const handleCaptures = useCallback(
    (captures: PendingCapture[]) => {
      // Recibo para la pantalla de Ajustes, ANTES de que el usuario
      // decida nada: lo que ese bloque responde es "¿el dato llega?", no
      // "¿lo registraste?". Una captura que se saltea o se descarta
      // prueba igual que la automatización de Atajos quedó bien armada.
      recordApplePayCaptures(captures)
      const rows = mapCapturesToReviewRows(captures, {
        today: formatISO(new Date()),
        history: historyRef.current,
      })
      setDraining(captures.map((capture) => capture.id))
      void (async () => {
        // Mismo cuidado que el share-import: iOS descarta en silencio un
        // <Modal> presentado mientras otro se está dismisseando.
        await new Promise<void>((resolve) => {
          InteractionManager.runAfterInteractions(() => resolve())
        })
        setReviewState({ rows, unmatched: 0 })
      })()
    },
    // Sin dependencias A PROPÓSITO: este callback tiene que ser estable de
    // por vida (ver `historyRef` arriba). Todo lo que cambia se lee por ref.
    [],
  )

  useApplePayCaptureGate({ familyId, userId, busy, onCaptures: handleCaptures })

  const handleConfirm = useCallback(
    async (rows: ReviewRow[]): Promise<ConfirmResult> => {
      const result = await confirmToDb(rows)
      // Se limpian las capturas drenadas, incluidas las que el usuario
      // marcó como skip: ya las vio y decidió. Dejarlas volvería a
      // ofrecérselas en cada foreground.
      //
      // Las que fallaron al insertar son la excepción: ahí el usuario SÍ
      // quiso registrarlas y se cayó la escritura, así que quedan
      // pendientes y se vuelven a ofrecer. `ReviewRow.id` es el id de la
      // captura (ver `map-captures-to-review-rows`), por eso el `rowId`
      // del fallo matchea directo.
      const failedIds = new Set(result.failed.map((failure) => failure.rowId))
      clearCaptures(draining.filter((id) => !failedIds.has(id)))
      return result
    },
    [confirmToDb, draining],
  )

  const handleClose = useCallback(
    (finalRows?: ReviewRow[]) => {
      // Cerrar sin confirmar NO es "no pasó nada". Las filas que quedaron en
      // `skip` son una decisión explícita del usuario, así que sus capturas
      // se descartan acá. Antes no se limpiaba nada en este camino —el CTA
      // "Cerrar" del resumen todo-salteado se saltea `handleConfirm` entero—
      // y las capturas se re-ofrecían en cada vuelta a foreground hasta
      // apilarse (reporte en device: tres Starbucks por un solo pago).
      //
      // Lo que NO se toca queda pendiente a propósito: si el usuario descarta
      // la hoja sin decidir nada, la captura sobrevive y se vuelve a ofrecer.
      // Un cierre accidental no puede costarle un pago.
      //
      // El camino de confirmar ya limpia en `handleConfirm` (y preserva las
      // que fallaron al insertar), así que después de confirmar esto queda en
      // no-op. El criterio completo, incluido el borde de las devoluciones,
      // vive en `capturesToClear`.
      clearCaptures(capturesToClear(finalRows, draining))
      setReviewState(null)
      setDraining([])
    },
    [draining],
  )

  return (
    <ImportReviewSheet
      visible={reviewState !== null}
      initialState={reviewState}
      familyId={familyId ?? ''}
      userId={userId ?? ''}
      onConfirmRows={handleConfirm}
      onClose={handleClose}
    />
  )
}
