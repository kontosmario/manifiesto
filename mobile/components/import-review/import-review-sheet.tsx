import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  FadeIn,
  FadeInLeft,
  FadeInRight,
  FadeOutLeft,
  FadeOutRight,
  FadeOutUp,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { ModalCard } from '@/components/ui/modal-card'
import { WizardSkinProvider, type WizardMode } from '@/components/wizard/wizard-skin'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeMode } from '@/theme/theme-provider'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useCategories } from '@/features/categories/use-categories'
import { rankCategoriesByUsage } from '@/features/expenses/category-ranking'
import { useExpenses } from '@/features/expenses/use-expenses'
import { toast } from '@/lib/toast-bus'
import { confetti } from '@/lib/confetti-bus'
import { triggerHaptic } from '@/lib/haptics'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { useImportReviewController } from '@/features/import-review/use-import-review-controller'
import { useConfirmImport } from '@/features/import-review/use-confirm-import'
import { formatISO } from '@/features/import-review/cycle-date-math'
import { formatMoney } from '@/features/import-review/format'
import type {
  ConfirmFailure,
  ConfirmResult,
  ReviewRow,
  ReviewState,
} from '@/features/import-review/types'
import { ImportReviewRow } from './import-review-row'
import { ImportReviewFooter } from './import-review-footer'
import { ImportReviewEmpty } from './import-review-empty'
import { ImportReviewHeader } from './import-review-header'
import { ImportReviewList } from './import-review-list'
import { ImportReviewReceipt } from './import-review-receipt'
import { useImportReviewNeo } from './import-review-neo'

interface Props {
  visible: boolean
  initialState: ReviewState | null
  familyId: string
  userId: string
  /**
   * Cierre del sheet. Recibe las filas FINALES —como quedaron después de
   * editarlas/marcarlas "no cargar"— para que el que lo monta pueda actuar
   * sobre lo que el usuario decidió, aunque no haya confirmado nada. El host
   * de Apple Pay las usa para descartar las capturas nativas de esas filas;
   * el resto de los puntos de montaje ignoran el parámetro.
   *
   * Viene `undefined` cuando el cierre no lo decidió el usuario sobre un set
   * de filas (p. ej. el sheet vacío).
   */
  onClose: (finalRows?: ReviewRow[]) => void
  /**
   * When true, the sheet mounts a fake confirm that just plays the
   * exit animation + success toast WITHOUT writing anything to the DB.
   * Used by the Settings preview so we can iterate on the wizard UI
   * without burning an IPA build cycle and without polluting real data.
   *
   * PRECEDENCIA: gana sobre `onConfirmRows`. Con `previewMode` en true el
   * confirm se resuelve con el resultado falso y el callback inyectado NO
   * corre — en silencio, sin warning.
   */
  previewMode?: boolean
  /**
   * Destino de la confirmación. Por defecto escribe con `useConfirmImport`
   * (el camino del import por OCR). Apple Pay inyecta el suyo para poder
   * limpiar las capturas nativas drenadas después de insertar.
   */
  onConfirmRows?: (rows: ReviewRow[]) => Promise<ConfirmResult>
}

// Las tres duraciones salen del vocabulario de navegación: entrar/salir de
// una vista es un push/pop de stack, y el fade del confirm es una salida de
// modal. Nada de números sueltos (`guard:motion-tokens`).
const ENTER_MS = motionDurations.enterStack
const EXIT_MS = motionDurations.exitStack
const CONFIRM_FADE_MS = motionDurations.exitModal
const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

/**
 * Vista actual. Reemplaza al `stepIndex` lineal `[0..totalRows]` del wizard
 * anterior, donde el conjunto (la lista) vivía DETRÁS de los N pasos y sólo
 * se llegaba recorriéndolos con una compuerta de validación en cada uno.
 *
 *   - `receipt` → un solo movimiento: se acepta de un tap (dirección C).
 *   - `list`    → la bandeja, raíz cuando hay 2+ (dirección A).
 *   - `edit`    → el detalle de UNA fila, siempre bajo demanda.
 *
 * La raíz la decide la cantidad de filas, no el historial de navegación: se
 * vuelve siempre al mismo lugar del que se salió.
 */
type SheetView =
  | { kind: 'receipt' }
  | { kind: 'list' }
  | { kind: 'edit'; rowId: string }

export function ImportReviewSheet({
  visible,
  initialState,
  familyId,
  userId,
  onClose,
  previewMode = false,
  onConfirmRows,
}: Props) {
  const mode = useThemeMode().resolvedMode as WizardMode
  const { softInk } = useImportReviewNeo()
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const controller = useImportReviewController(initialState ?? undefined)
  const categoriesQuery = useCategories(familyId, 'expense')
  const expensesQuery = useExpenses(familyId)
  const defaultConfirm = useConfirmImport({ familyId, userId })
  const confirm = onConfirmRows ?? defaultConfirm
  const payCycle = usePayCycle(familyId)
  const cycleDays = Math.max(
    1,
    Math.round(
      (payCycle.cycle.end.getTime() - payCycle.cycle.start.getTime()) / 86_400_000,
    ),
  )
  const today = formatISO(payCycle.today)

  const [busy, setBusy] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const [view, setView] = useState<SheetView>({ kind: 'list' })
  // Filas cuyo insert falló en el intento anterior. La hoja se QUEDA abierta
  // y las marca, en vez de cerrarse con un toast que decía cuántas fallaron
  // pero no cuáles, sobre una pantalla que ya no existía.
  const [failures, setFailures] = useState<ConfirmFailure[]>([])
  const [highlightToken, setHighlightToken] = useState(0)
  // La dirección del slide vive FUERA del estado para que las animaciones
  // del próximo render la lean sin provocar un segundo render.
  const directionRef = useRef<'forward' | 'back'>('forward')

  const totalRows = controller.state.rows.length
  const rootView: SheetView = totalRows === 1 ? { kind: 'receipt' } : { kind: 'list' }

  useEffect(() => {
    if (initialState) {
      controller.replaceState(initialState)
      setView(initialState.rows.length === 1 ? { kind: 'receipt' } : { kind: 'list' })
      setFailures([])
      directionRef.current = 'forward'
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialState])

  const invalidIdSet = useMemo(
    () => new Set(controller.invalidIds),
    [controller.invalidIds],
  )
  const failedIdSet = useMemo(
    () => new Set(failures.map((f) => f.rowId)),
    [failures],
  )

  /**
   * Categorías rankeadas por uso del hogar. Es la única decisión obligatoria
   * del flujo y era la peor servida: ~30 tiles en orden de catálogo, con las
   * 12 curadas —Combustible, Delivery, Cafetería, Farmacia— al final, que son
   * justo las que matchean un resumen de tarjeta. Memoizado además porque su
   * identidad viaja al riel: un array nuevo por render derrotaba el `memo` de
   * cada Tile.
   */
  const rankedCategories = useMemo(
    () =>
      rankCategoriesByUsage(
        expensesQuery.data ?? [],
        (categoriesQuery.data ?? []).slice(),
      ),
    [expensesQuery.data, categoriesQuery.data],
  )

  const editingRow =
    view.kind === 'edit'
      ? (controller.state.rows.find((r) => r.id === view.rowId) ?? null)
      : null
  const singleRow = totalRows === 1 ? controller.state.rows[0] : null
  const focusRow = editingRow ?? singleRow

  const focusMissingFields = focusRow
    ? controller.missingFieldsFor(focusRow.id)
    : []

  const origin: 'ocr' | 'apple-pay' =
    controller.state.rows[0]?.source.origin === 'apple-pay' ? 'apple-pay' : 'ocr'

  const missingCount = controller.invalidIds.length

  // ─────────────────────────── navegación ───────────────────────────

  const goToRoot = useCallback(() => {
    directionRef.current = 'back'
    setView(rootView)
  }, [rootView.kind]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Abre una fila. Si está incompleta, MARCA sus campos faltantes al entrar:
   * antes el salto automático al primer inválido aterrizaba en un formulario
   * que se veía perfectamente normal (el `highlightToken` no se bumpeaba y el
   * remount por key reseteaba el flag), justo después de un aviso que decía
   * "hay un movimiento sin completar".
   */
  const openRow = useCallback(
    (rowId: string, flagMissing = false) => {
      directionRef.current = 'forward'
      if (flagMissing) setHighlightToken((prev) => prev + 1)
      setView({ kind: 'edit', rowId })
    },
    [],
  )

  const nextPendingId = useMemo(() => {
    if (view.kind !== 'edit') return null
    return controller.invalidIds.find((id) => id !== view.rowId) ?? null
  }, [controller.invalidIds, view])

  const handleNextPending = useCallback(() => {
    if (nextPendingId) openRow(nextPendingId, true)
  }, [nextPendingId, openRow])

  const handleToggleSkip = useCallback(() => {
    if (!focusRow) return
    if (focusRow.kind === 'skip') {
      controller.unskipRow(focusRow.id)
      return
    }
    void triggerHaptic('warning')
    controller.skipRow(focusRow.id)
    // NO auto-avanza. El auto-avance de antes hacía que la acción fuera
    // instantánea y su reversa exigiera adivinar que había que tocar
    // "Anterior": el usuario perdía de vista lo que acababa de descartar.
    // Acá el estado queda a la vista con su botón de deshacer al lado.
  }, [focusRow, controller])

  // ─────────────────────────── confirmar ───────────────────────────

  const handlePrimary = useCallback(() => {
    if (view.kind === 'edit') {
      // El CTA de la edición vuelve a la raíz. Si la fila quedó incompleta,
      // marca lo que falta en vez de dejar salir en silencio.
      if (focusRow && invalidIdSet.has(focusRow.id)) {
        void triggerHaptic('warning')
        setHighlightToken((prev) => prev + 1)
        return
      }
      void triggerHaptic('selection')
      goToRoot()
      return
    }

    if (!controller.canConfirm) {
      // Nada para cargar y nada roto: el usuario decidió no cargar nada.
      // No es un error — se cierra con lo que decidió.
      if (controller.invalidIds.length === 0) {
        onClose(controller.state.rows)
        return
      }
      void triggerHaptic('warning')
      // En el RECIBO, si lo único que falta es la categoría, el riel ya está
      // en pantalla: mandar al usuario a un formulario cuando el control que
      // necesita está a la vista sería peor que no hacer nada. Sólo se navega
      // cuando falta algo que el recibo no puede editar (la descripción).
      const onlyCategoryMissing =
        focusMissingFields.length === 1 &&
        focusMissingFields[0] === t('gastos:import.field.category')
      if (totalRows === 1 && onlyCategoryMissing) return

      const firstInvalidId = controller.firstInvalidId
      if (firstInvalidId) openRow(firstInvalidId, true)
      return
    }
    void handleConfirm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, focusRow, invalidIdSet, controller, goToRoot, openRow, onClose])

  async function handleConfirm() {
    setBusy(true)
    try {
      const result = previewMode
        ? {
            insertedExpenses: controller.submittableBreakdown.expenses,
            insertedIncomes: controller.submittableBreakdown.incomes,
            skipped: controller.skippedCount,
            failed: [],
          }
        : await confirm(controller.state.rows)
      const total = result.insertedExpenses + result.insertedIncomes

      // REPARACIÓN: si algo falló, la hoja NO se cierra. Se queda con las
      // filas caídas marcadas para que el usuario reintente sólo esas.
      // Cerrar con un toast que decía "2 no se pudieron cargar" dejaba al
      // usuario sin saber CUÁLES, con el trabajo de edición inalcanzable y
      // con la única salida de reimportar y duplicar lo que sí entró.
      if (result.failed.length > 0) {
        setFailures(result.failed)
        // Lo que SÍ entró se saca del set para no re-insertarlo al
        // reintentar: es exactamente el mecanismo que evitaba el duplicado.
        const failedIds = new Set(result.failed.map((f) => f.rowId))
        const remaining = controller.state.rows.filter(
          (r) => failedIds.has(r.id) || r.kind === 'skip',
        )
        controller.replaceState({ ...controller.state, rows: remaining })
        setView(remaining.length === 1 ? { kind: 'receipt' } : { kind: 'list' })
        void triggerHaptic('warning')
        return
      }

      if (total > 0) void triggerHaptic('success')

      // Fade cinematográfico: el cuerpo se va hacia arriba antes de que el
      // modal se descarte, así el usuario ve salir las filas.
      setFadingOut(true)
      await new Promise<void>((resolve) =>
        setTimeout(resolve, CONFIRM_FADE_MS + 80),
      )

      if (total > 0) {
        const parts: string[] = []
        if (result.insertedExpenses > 0) {
          parts.push(t('gastos:import.summary.expensesCount', { count: result.insertedExpenses }))
        }
        if (result.insertedIncomes > 0) {
          parts.push(t('gastos:import.summary.incomesCount', { count: result.insertedIncomes }))
        }
        const joined = parts.join(t('gastos:import.summary.and'))
        // El toast lleva la PLATA, no sólo el conteo: nueve pasos de revisión
        // terminaban en "Cargué 8 gastos", menos información que cargar uno
        // a mano.
        const withTotal = `${joined} · ${formatMoney(controller.submittableTotal)}`
        toast.success(
          previewMode
            ? t('gastos:import.toast.previewLoaded', { parts: withTotal })
            : t('gastos:import.toast.loaded', { parts: withTotal }),
        )
      }
      onClose(controller.state.rows)

      // El confetti va DESPUÉS de `onClose()` porque su host está montado en
      // el shell de la app (detrás del <Modal> nativo del ModalCard). Si sale
      // con la hoja en pantalla, la explosión se pinta atrás.
      if (total >= 3) {
        setTimeout(() => {
          confetti.celebrate({ durationMs: 2200, origin: 'top' })
        }, 260)
      }
    } finally {
      setBusy(false)
      setFadingOut(false)
    }
  }

  /**
   * "Ahora no": cierra dejando pendiente lo que el usuario no decidió. NO
   * destruye. Lo único que se descarta son las filas que él marcó "no cargar"
   * — el host de Apple Pay lee eso de las filas finales.
   */
  const handleNotNow = useCallback(() => {
    onClose(controller.state.rows)
  }, [onClose, controller.state.rows])

  const handlePatch = useCallback(
    (patch: Partial<ReviewRow>) => {
      if (!focusRow) return
      controller.patchRow(focusRow.id, patch)
    },
    [focusRow, controller],
  )
  const handleSetKind = useCallback(
    (kind: ReviewRow['kind']) => {
      if (!focusRow) return
      controller.setRowKind(focusRow.id, kind)
    },
    [focusRow, controller],
  )
  const handleUnskip = useCallback(() => {
    if (!focusRow) return
    controller.unskipRow(focusRow.id)
  }, [focusRow, controller])
  const handleSelectCategoryOnReceipt = useCallback(
    (categoryId: string) => {
      if (!singleRow) return
      controller.patchRow(singleRow.id, { categoryId })
    },
    [singleRow, controller],
  )

  // ─────────────────────────── render ───────────────────────────

  const viewKey =
    view.kind === 'edit' ? `edit-${view.rowId}` : view.kind

  const positionInList = useMemo(() => {
    if (view.kind !== 'edit' || totalRows <= 1) return undefined
    const index = controller.state.rows.findIndex((r) => r.id === view.rowId)
    return index >= 0 ? { index: index + 1, total: totalRows } : undefined
  }, [view, controller.state.rows, totalRows])

  const footer =
    totalRows > 0 ? (
      <ImportReviewFooter
        view={view.kind === 'edit' ? 'edit' : totalRows === 1 ? 'receipt' : 'list'}
        expensesCount={controller.submittableBreakdown.expenses}
        incomesCount={controller.submittableBreakdown.incomes}
        submittableTotal={controller.submittableTotal}
        canConfirm={controller.canConfirm}
        missingFields={focusMissingFields}
        missingCount={missingCount}
        isCurrentSkipped={focusRow?.kind === 'skip'}
        hasNextPending={nextPendingId !== null}
        canGoBack={totalRows > 1}
        hasFailures={failures.length > 0}
        busy={busy}
        onPrimary={handlePrimary}
        onBack={goToRoot}
        onEdit={() => {
          if (singleRow) openRow(singleRow.id)
        }}
        onResolveMissing={() => {
          if (controller.firstInvalidId) openRow(controller.firstInvalidId, true)
        }}
        onNotNow={handleNotNow}
        onToggleSkip={handleToggleSkip}
        onNextPending={handleNextPending}
      />
    ) : undefined

  const entering = reduced
    ? undefined
    : directionRef.current === 'forward'
      ? FadeInRight.duration(ENTER_MS).easing(EASE_IOS)
      : FadeInLeft.duration(ENTER_MS).easing(EASE_IOS)

  const exiting = reduced
    ? undefined
    : fadingOut
      ? FadeOutUp.duration(CONFIRM_FADE_MS).easing(EASE_IOS)
      : directionRef.current === 'forward'
        ? FadeOutLeft.duration(EXIT_MS).easing(EASE_IOS)
        : FadeOutRight.duration(EXIT_MS).easing(EASE_IOS)

  // El provider envuelve a la hoja ENTERA, no solo a sus children: el footer
  // viaja como prop de `ModalCard` y se renderiza adentro de SU árbol, así que
  // un provider puesto sobre los children lo dejaría afuera del contexto.
  return (
    <WizardSkinProvider mode={mode}>
      <ModalCard
        skin="neo"
        visible={visible}
        // Descartar la hoja (backdrop / swipe) también es un cierre del
        // usuario: viaja con las filas finales, así lo que haya marcado "no
        // cargar" se respeta aunque nunca haya confirmado.
        onClose={busy ? () => {} : () => onClose(controller.state.rows)}
        title=""
        subtitle=""
        footer={footer}
      >
        {totalRows === 0 ? (
          <ImportReviewEmpty />
        ) : (
          <View style={styles.wrapper}>
            {failures.length > 0 ? (
              <RepairBanner failures={failures} />
            ) : null}

            <View style={styles.host}>
              <Animated.View key={viewKey} entering={entering} exiting={exiting}>
                {view.kind === 'edit' && editingRow ? (
                  <>
                    <ImportReviewHeader
                      row={editingRow}
                      position={positionInList}
                      incomplete={invalidIdSet.has(editingRow.id)}
                      imageUri={controller.state.imageUri}
                      onBack={totalRows > 1 ? goToRoot : undefined}
                    />
                    <ImportReviewRow
                      row={editingRow}
                      categories={rankedCategories}
                      cycleStart={payCycle.cycle.start}
                      cycleDays={cycleDays}
                      today={today}
                      missingFields={focusMissingFields}
                      highlightToken={highlightToken}
                      onSetKind={handleSetKind}
                      onPatch={handlePatch}
                      onUnskip={handleUnskip}
                    />
                  </>
                ) : totalRows === 1 && singleRow ? (
                  <ImportReviewReceipt
                    row={singleRow}
                    categories={rankedCategories}
                    missingFields={focusMissingFields}
                    onSelectCategory={handleSelectCategoryOnReceipt}
                  />
                ) : (
                  <ImportReviewList
                    rows={controller.state.rows}
                    categories={rankedCategories}
                    invalidIds={invalidIdSet}
                    failedIds={failedIdSet}
                    submittableTotal={controller.submittableTotal}
                    parsedTotal={controller.parsedTotal}
                    skippedCount={controller.skippedCount}
                    imageUri={controller.state.imageUri}
                    origin={origin}
                    onOpenRow={openRow}
                  />
                )}
              </Animated.View>
            </View>

            {controller.state.unmatched > 0 && view.kind !== 'edit' ? (
              <Text style={[styles.unmatched, { color: softInk }]}>
                {t('gastos:import.unmatched', { count: controller.state.unmatched })}
              </Text>
            ) : null}
          </View>
        )}
      </ModalCard>
    </WizardSkinProvider>
  )
}

/**
 * Cabecera de reparación. `ConfirmFailure` ya traía el `rowId`, la
 * descripción y el motivo, y no se rendía en ningún lado: el usuario sólo
 * veía un conteo en un toast.
 */
function RepairBanner({ failures }: { failures: readonly ConfirmFailure[] }) {
  const { neo, ink } = useImportReviewNeo()
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const firstReason = failures[0]?.reason ?? ''
  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(motionDurations.standard)}
      style={[styles.repair, { backgroundColor: neo.well, boxShadow: neo.shadows.insetSm }]}
    >
      <MaterialIcons name="error-outline" size={18} color={ink.danger} />
      <View style={styles.repairText}>
        <Text style={[styles.repairTitle, { color: neo.text }]}>
          {t('gastos:import.repair.title', { count: failures.length })}
        </Text>
        <Text style={[styles.repairBody, { color: neo.textMuted }]}>
          {t('gastos:import.repair.body')}
        </Text>
        {firstReason !== '' ? (
          <Text style={[styles.repairBody, { color: neo.textMuted }]} numberOfLines={2}>
            {t('gastos:import.repair.reason', { reason: firstReason.slice(0, 120) })}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrapper: { gap: 8, paddingBottom: 4 },
  host: { marginTop: 0 },
  // El `fontFamily` viaja con el peso: cada peso de Nunito es un face
  // estático propio, así que sin él el 700 se renderiza como regular.
  unmatched: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    marginTop: 6,
  },
  repair: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 18,
    padding: 14,
    marginTop: 8,
  },
  repairText: { flex: 1, gap: 3 },
  repairTitle: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.2,
  },
  repairBody: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
})
