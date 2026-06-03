import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeInLeft,
  FadeInRight,
  FadeOutLeft,
  FadeOutRight,
  FadeOutUp,
} from 'react-native-reanimated'
import { ModalCard } from '@/components/ui/modal-card'
import { useAppTheme } from '@/theme/theme-provider'
import { useCategories } from '@/features/categories/use-categories'
import { toast } from '@/lib/toast-bus'
import { confetti } from '@/lib/confetti-bus'
import { triggerHaptic } from '@/lib/haptics'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { useImportReviewController } from '@/features/import-review/use-import-review-controller'
import { useConfirmImport } from '@/features/import-review/use-confirm-import'
import { formatISO } from '@/features/import-review/cycle-date-math'
import type { ReviewState } from '@/features/import-review/types'
import { ImportReviewRow } from './import-review-row'
import { ImportReviewFooter } from './import-review-footer'
import { ImportReviewEmpty } from './import-review-empty'
import { ImportReviewHeader } from './import-review-header'
import { ImportReviewSummary } from './import-review-summary'
import {
  ImportReviewStepIndicator,
  type StepStatus,
} from './import-review-step-indicator'

interface Props {
  visible: boolean
  initialState: ReviewState | null
  familyId: string
  userId: string
  onClose: () => void
  /**
   * When true, the sheet mounts a fake confirm that just plays the
   * exit animation + success toast WITHOUT writing anything to the DB.
   * Used by the Settings preview so we can iterate on the wizard UI
   * without burning an IPA build cycle and without polluting real data.
   */
  previewMode?: boolean
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
}: Props) {
  const { theme } = useAppTheme()
  const controller = useImportReviewController(initialState ?? undefined)
  const categoriesQuery = useCategories(familyId, 'expense')
  const categories = categoriesQuery.data ?? []
  const confirm = useConfirmImport({ familyId, userId })
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
    directionRef.current = 'forward'
    void triggerHaptic('selection')
    setStepIndex(stepIndex + 1)
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
      toast.error(
        'Hay un movimiento sin completar — revisalo antes de confirmar.',
      )
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

      // Cinematic fade-out: the form fades up before the modal dismisses
      // so the user sees the rows leave instead of a hard cut.
      setFadingOut(true)
      await new Promise<void>((resolve) =>
        setTimeout(resolve, CONFIRM_FADE_MS + 80),
      )

      if (total > 0) {
        const parts: string[] = []
        if (result.insertedExpenses > 0) {
          parts.push(
            `${result.insertedExpenses} gasto${result.insertedExpenses === 1 ? '' : 's'}`,
          )
        }
        if (result.insertedIncomes > 0) {
          parts.push(
            `${result.insertedIncomes} ingreso${result.insertedIncomes === 1 ? '' : 's'}`,
          )
        }
        const baseMsg = previewMode
          ? `Vista previa: ${parts.join(' y ')} (no se cargó nada).`
          : `Cargué ${parts.join(' y ')}.`
        if (result.failed.length > 0) {
          toast.error(
            `${baseMsg} ${result.failed.length} no se pudieron cargar.`,
            { durationMs: 6000 },
          )
        } else {
          toast.success(baseMsg)
        }
      } else if (result.failed.length > 0) {
        toast.error(
          `No se pudo cargar ningún movimiento (${result.failed.length} errores).`,
          { durationMs: 6000 },
        )
      }
      onClose()

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

  const wizardFooter =
    totalRows > 0 ? (
      <ImportReviewFooter
        stepIndex={stepIndex}
        totalSteps={totalRows}
        isSummary={isSummary}
        expensesCount={controller.submittableBreakdown.expenses}
        incomesCount={controller.submittableBreakdown.incomes}
        canConfirm={controller.canConfirm}
        isCurrentSkipped={currentRow?.kind === 'skip'}
        busy={busy}
        onPrev={goPrev}
        onNext={goNext}
        onSkip={handleSkipToggle}
        onConfirm={handleConfirmAttempt}
      />
    ) : undefined

  return (
    <ModalCard
      visible={visible}
      onClose={busy ? () => {} : onClose}
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
                />
              ) : currentRow ? (
                <ImportReviewRow
                  row={currentRow}
                  categories={categories}
                  invalid={invalidIdSet.has(currentRow.id)}
                  cycleStart={payCycle.cycle.start}
                  cycleDays={cycleDays}
                  today={today}
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
            <Text style={[styles.unmatched, { color: theme.colors.textMuted }]}>
              {`${controller.state.unmatched} líneas no se pudieron clasificar.`}
            </Text>
          ) : null}
        </View>
      )}
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  wrapper: { gap: 8, paddingBottom: 4 },
  stepHost: { marginTop: 0 },
  unmatched: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
})
