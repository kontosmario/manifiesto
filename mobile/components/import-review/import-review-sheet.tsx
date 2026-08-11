import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  FadeInLeft,
  FadeInRight,
  FadeOutLeft,
  FadeOutRight,
  FadeOutUp,
} from 'react-native-reanimated'
import { ModalCard } from '@/components/ui/modal-card'
import { WizardSkinProvider, type WizardMode } from '@/components/wizard/wizard-skin'
import { nunitoFamily } from '@/theme/typography'
import { useThemeMode } from '@/theme/theme-provider'
import { useCategories } from '@/features/categories/use-categories'
import { toast } from '@/lib/toast-bus'
import { confetti } from '@/lib/confetti-bus'
import { triggerHaptic } from '@/lib/haptics'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { useImportReviewController } from '@/features/import-review/use-import-review-controller'
import { useConfirmImport } from '@/features/import-review/use-confirm-import'
import { formatISO } from '@/features/import-review/cycle-date-math'
import type { ConfirmResult, ReviewRow, ReviewState } from '@/features/import-review/types'
import { ImportReviewRow } from './import-review-row'
import { ImportReviewFooter } from './import-review-footer'
import { ImportReviewEmpty } from './import-review-empty'
import { ImportReviewHeader } from './import-review-header'
import { ImportReviewSummary } from './import-review-summary'
import {
  ImportReviewStepIndicator,
  type StepStatus,
} from './import-review-step-indicator'
import { useImportReviewNeo } from './import-review-neo'

interface Props {
  visible: boolean
  initialState: ReviewState | null
  familyId: string
  userId: string
  /**
   * Cierre del sheet. Recibe las filas FINALES —como quedaron después de
   * editarlas/saltearlas— para que el que lo monta pueda actuar sobre lo que
   * el usuario decidió, aunque no haya confirmado nada. El host de Apple Pay
   * las usa para descartar las capturas nativas de las filas salteadas; el
   * resto de los puntos de montaje ignoran el parámetro.
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
   * corre — en silencio, sin warning. Pasar los dos juntos no tiene
   * sentido; si alguna vez hace falta, hay que decidir cuál manda acá.
   */
  previewMode?: boolean
  /**
   * Destino de la confirmación. Por defecto escribe con `useConfirmImport`
   * (el camino del import por OCR). Apple Pay inyecta el suyo para poder
   * limpiar las capturas nativas drenadas después de insertar.
   *
   * `previewMode` tiene precedencia: ver su nota arriba.
   */
  onConfirmRows?: (rows: ReviewRow[]) => Promise<ConfirmResult>
}

const STEP_ENTER_MS = 280
const STEP_EXIT_MS = 200
const CONFIRM_FADE_MS = 220
const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

/**
 * `stepIndex` lives on an extended index space:
 *   [0, totalRows)        → per-movement editing
 *   totalRows             → summary / confirm step
 *
 * Going past the last movement enters summary; tapping "Volver a editar"
 * from the summary drops back into the last movement step.
 */
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
  const controller = useImportReviewController(initialState ?? undefined)
  const categoriesQuery = useCategories(familyId, 'expense')
  const categories = categoriesQuery.data ?? []
  const defaultConfirm = useConfirmImport({ familyId, userId })
  const confirm = onConfirmRows ?? defaultConfirm
  const payCycle = usePayCycle(familyId)
  const cycleDays = Math.max(
    1,
    Math.round(
      (payCycle.cycle.end.getTime() - payCycle.cycle.start.getTime()) /
        86_400_000,
    ),
  )
  const today = formatISO(payCycle.today)
  const [busy, setBusy] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  // Bumped each time the user taps the disabled primary CTA. The
  // current row reads it and flips its `isFlagged` state so unfilled
  // required fields paint with their `warning` mode. Stored per-row
  // implicitly via the row's remount-on-step semantics.
  const [highlightToken, setHighlightToken] = useState(0)
  // Slide direction is tracked OUTSIDE state so the next render's
  // entering/exiting animations can read the right value without
  // re-rendering twice on every step change.
  const directionRef = useRef<'forward' | 'back'>('forward')

  useEffect(() => {
    if (initialState) {
      controller.replaceState(initialState)
      setStepIndex(0)
      directionRef.current = 'forward'
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialState])

  const totalRows = controller.state.rows.length
  // stepIndex range: [0, totalRows]  — last index is the summary step.
  const summaryIndex = totalRows
  const isSummary = stepIndex >= summaryIndex && totalRows > 0
  const editStep = Math.min(stepIndex, Math.max(0, totalRows - 1))
  const currentRow = isSummary ? null : controller.state.rows[editStep]
  const invalidIdSet = useMemo(
    () => new Set(controller.invalidIds),
    [controller.invalidIds],
  )

  const statuses: StepStatus[] = useMemo(() => {
    return controller.state.rows.map((row, idx) => {
      if (row.kind === 'skip') return 'skipped'
      if (isSummary) return 'done'
      if (invalidIdSet.has(row.id)) {
        return idx === editStep ? 'current' : 'invalid'
      }
      if (idx === editStep) return 'current'
      if (idx < editStep) return 'done'
      return 'pending'
    })
  }, [controller.state.rows, invalidIdSet, editStep, isSummary])

  function goNext() {
    if (stepIndex >= summaryIndex) return
    // Caller already checks `canAdvanceCurrent`; this guards alternate
    // entry points (e.g. gestures, keyboard handlers).
    if (currentRow && invalidIdSet.has(currentRow.id)) {
      void triggerHaptic('warning')
      setHighlightToken((prev) => prev + 1)
      return
    }
    directionRef.current = 'forward'
    void triggerHaptic('selection')
    setStepIndex(stepIndex + 1)
  }

  /**
   * Routed primary-CTA handler. The footer keeps a single onPress; the
   * sheet decides what each tap means based on current state:
   *   - on summary: confirm (or jump-to-invalid if confirm blocked)
   *   - on a movement step with all required fields filled: advance
   *   - on a movement step with missing fields: bump highlightToken
   *     so the current row paints its missing inputs with warning.
   */
  function handlePrimaryPress() {
    if (isSummary) {
      handleConfirmAttempt()
      return
    }
    if (currentRow && invalidIdSet.has(currentRow.id)) {
      void triggerHaptic('warning')
      setHighlightToken((prev) => prev + 1)
      return
    }
    goNext()
  }

  function goPrev() {
    if (stepIndex <= 0) return
    directionRef.current = 'back'
    void triggerHaptic('selection')
    setStepIndex(stepIndex - 1)
  }

  function jumpTo(idx: number) {
    if (idx === stepIndex) return
    directionRef.current = idx > stepIndex ? 'forward' : 'back'
    setStepIndex(idx)
  }

  function handleSkipToggle() {
    if (!currentRow) return
    if (currentRow.kind === 'skip') {
      controller.unskipRow(currentRow.id)
      return
    }
    void triggerHaptic('warning')
    controller.skipRow(currentRow.id)
    // Auto-advance past a skipped row — the user said "this one is
    // noise" so we move on. If we were already on the last movement,
    // we jump straight into the summary so the wizard keeps moving
    // forward — never feels stuck.
    if (stepIndex < summaryIndex) {
      directionRef.current = 'forward'
      setStepIndex(stepIndex + 1)
    }
  }

  function handleConfirmAttempt() {
    if (!controller.canConfirm) {
      // All-skipped (nothing invalid, nothing to load): NOT an error. The
      // user deliberately skipped everything (e.g. the capture was already
      // loaded). The old path lied with "something's incomplete" and left
      // them trapped on an inert CTA with no jump target. Just close.
      //
      // Este atajo se saltea `handleConfirm()` entero, así que es el ÚNICO
      // lugar donde el que monta se entera de lo que pasó: por eso el cierre
      // viaja con las filas finales. Sin ellas el host de Apple Pay no podía
      // limpiar nada y las capturas salteadas se re-ofrecían para siempre.
      if (controller.invalidIds.length === 0) {
        onClose(controller.state.rows)
        return
      }
      // Jump to the first invalid step so the user lands exactly where
      // the form needs fixing. Cheaper than scrolling through a list of
      // dots looking for the red one.
      const firstInvalidId = controller.invalidIds[0]
      if (firstInvalidId) {
        const idx = controller.state.rows.findIndex(
          (r) => r.id === firstInvalidId,
        )
        if (idx >= 0) jumpTo(idx)
      }
      void triggerHaptic('warning')
      toast.error(t('gastos:import.toast.incomplete'))
      return
    }
    void handleConfirm()
  }

  async function handleConfirm() {
    setBusy(true)
    try {
      // Preview mode: fake the confirm result so we can drive the exit
      // animation + confetti + toast without touching the DB. The
      // breakdown comes from the controller so the toast wording still
      // reflects what the user actually saw.
      const result = previewMode
        ? {
            insertedExpenses: controller.submittableBreakdown.expenses,
            insertedIncomes: controller.submittableBreakdown.incomes,
            skipped: controller.skippedCount,
            failed: [],
          }
        : await confirm(controller.state.rows)
      const total = result.insertedExpenses + result.insertedIncomes

      // The climax of the whole flow ("I loaded your movements") was mute —
      // every other step buzzes ('selection'/'warning') but the payoff
      // didn't. Reward the successful commit (partial failure stays on the
      // 'warning' tone the error toast already implies).
      if (total > 0 && result.failed.length === 0) {
        void triggerHaptic('success')
      }

      // Cinematic fade-out: the form fades up before the modal dismisses
      // so the user sees the rows leave instead of a hard cut.
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
        const baseMsg = previewMode
          ? t('gastos:import.toast.previewLoaded', { parts: joined })
          : t('gastos:import.toast.loaded', { parts: joined })
        if (result.failed.length > 0) {
          const firstReason = result.failed[0]?.reason ?? ''
          const reasonSuffix = firstReason
            ? t('gastos:import.toast.reasonSuffix', { reason: firstReason.slice(0, 120) })
            : ''
          toast.error(
            t('gastos:import.toast.partialFailure', {
              baseMsg,
              count: result.failed.length,
              reasonSuffix,
            }),
            { durationMs: 9000 },
          )
        } else {
          toast.success(baseMsg)
        }
      } else if (result.failed.length > 0) {
        // Mostrar la PRIMERA razón real — "(N errores)" a secas dejaba
        // al usuario (y a nosotros) sin nada accionable. Device report
        // 2026-06-12: import falló completo y la causa era invisible.
        const firstReason = result.failed[0]?.reason ?? ''
        const reasonSuffix = firstReason
          ? t('gastos:import.toast.reasonSuffix', { reason: firstReason.slice(0, 120) })
          : ''
        toast.error(
          t('gastos:import.toast.allFailed', {
            count: result.failed.length,
            reasonSuffix,
          }),
          { durationMs: 9000 },
        )
      }
      onClose(controller.state.rows)

      // Confetti fires AFTER `onClose()` because the host is mounted at
      // the app shell (behind the ModalCard's native Modal). If we fire
      // it while the sheet is still on screen, the burst paints behind
      // the modal. Threshold ≥3 catches real bulk imports without
      // celebrating a one-off.
      if (total >= 3 && result.failed.length === 0) {
        setTimeout(() => {
          confetti.celebrate({ durationMs: 2200, origin: 'top' })
        }, 260)
      }
    } finally {
      setBusy(false)
      setFadingOut(false)
    }
  }

  // Stable key per step so the entering/exiting transition fires on
  // every navigation. Bakes in row.id (or "summary") so unrelated
  // re-renders never trigger an unwanted slide animation.
  const stepKey = isSummary
    ? 'summary'
    : currentRow
      ? `${editStep}-${currentRow.id}`
      : `step-${editStep}`

  const headerLabel = isSummary
    ? totalRows
    : editStep + 1

  const currentMissingFields = currentRow
    ? controller.missingFieldsFor(currentRow.id)
    : []

  const wizardFooter =
    totalRows > 0 ? (
      <ImportReviewFooter
        stepIndex={stepIndex}
        totalSteps={totalRows}
        isSummary={isSummary}
        expensesCount={controller.submittableBreakdown.expenses}
        incomesCount={controller.submittableBreakdown.incomes}
        canConfirm={controller.canConfirm}
        canAdvanceCurrent={currentMissingFields.length === 0}
        missingFields={currentMissingFields}
        isCurrentSkipped={currentRow?.kind === 'skip'}
        busy={busy}
        onPrev={goPrev}
        onPrimary={handlePrimaryPress}
        onSkip={handleSkipToggle}
      />
    ) : undefined

  // El provider envuelve a la hoja ENTERA, no solo a sus children: el footer
  // viaja como prop de `ModalCard` y se renderiza adentro de SU árbol, así que
  // un provider puesto sobre los children lo dejaría afuera del contexto.
  // Con esto los compartidos skin-aware que monta el paso (`AmountCard`,
  // `CategoryHorizontalRail`, `TileRail`) resuelven a su rama del rediseño.
  return (
    <WizardSkinProvider mode={mode}>
    <ModalCard
      skin="neo"
      visible={visible}
      // Descartar la hoja (backdrop / botón de cerrar) también es un cierre
      // del usuario: viaja con las filas finales, así lo que haya salteado a
      // mano se respeta aunque nunca haya llegado al resumen.
      onClose={busy ? () => {} : () => onClose(controller.state.rows)}
      title=""
      subtitle=""
      footer={wizardFooter}
    >
      {totalRows === 0 ? (
        <ImportReviewEmpty />
      ) : (
        <View style={styles.wrapper}>
          <ImportReviewHeader
            stepIndex={headerLabel}
            total={totalRows}
            imageUri={controller.state.imageUri}
            mode={isSummary ? 'summary' : 'edit'}
          />
          <ImportReviewStepIndicator statuses={statuses} />

          <View style={styles.stepHost}>
            <Animated.View
              key={stepKey}
              entering={
                directionRef.current === 'forward'
                  ? FadeInRight.duration(STEP_ENTER_MS).easing(EASE_IOS)
                  : FadeInLeft.duration(STEP_ENTER_MS).easing(EASE_IOS)
              }
              exiting={
                fadingOut
                  ? FadeOutUp.duration(CONFIRM_FADE_MS).easing(EASE_IOS)
                  : directionRef.current === 'forward'
                    ? FadeOutLeft.duration(STEP_EXIT_MS).easing(EASE_IOS)
                    : FadeOutRight.duration(STEP_EXIT_MS).easing(EASE_IOS)
              }
            >
              {isSummary ? (
                <ImportReviewSummary
                  rows={controller.state.rows}
                  categories={categories}
                  expensesCount={controller.submittableBreakdown.expenses}
                  incomesCount={controller.submittableBreakdown.incomes}
                  skippedCount={controller.skippedCount}
                  onJumpTo={(rowId) => {
                    const idx = controller.state.rows.findIndex(
                      (r) => r.id === rowId,
                    )
                    if (idx >= 0) jumpTo(idx)
                  }}
                />
              ) : currentRow ? (
                <ImportReviewRow
                  row={currentRow}
                  categories={categories}
                  cycleStart={payCycle.cycle.start}
                  cycleDays={cycleDays}
                  today={today}
                  missingFields={currentMissingFields}
                  highlightToken={highlightToken}
                  onSetKind={(kind) =>
                    controller.setRowKind(currentRow.id, kind)
                  }
                  onPatch={(patch) =>
                    controller.patchRow(currentRow.id, patch)
                  }
                  onUnskip={() => controller.unskipRow(currentRow.id)}
                />
              ) : null}
            </Animated.View>
          </View>

          {controller.state.unmatched > 0 && !isSummary ? (
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

const styles = StyleSheet.create({
  wrapper: { gap: 8, paddingBottom: 4 },
  stepHost: { marginTop: 0 },
  // El `fontFamily` viaja con el peso: cada peso de Nunito es un face
  // estático propio, así que sin él el 700 se renderiza como regular.
  unmatched: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    marginTop: 6,
  },
})
