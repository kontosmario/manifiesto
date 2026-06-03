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
}

const STEP_ENTER_MS = 280
const STEP_EXIT_MS = 200
const CONFIRM_FADE_MS = 220
const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

export function ImportReviewSheet({
  visible,
  initialState,
  familyId,
  userId,
  onClose,
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
  const clampedStep = Math.min(stepIndex, Math.max(0, totalRows - 1))
  const currentRow = controller.state.rows[clampedStep]
  const invalidIdSet = useMemo(
    () => new Set(controller.invalidIds),
    [controller.invalidIds],
  )

  const statuses: StepStatus[] = useMemo(() => {
    return controller.state.rows.map((row, idx) => {
      if (row.kind === 'skip') return 'skipped'
      if (invalidIdSet.has(row.id)) {
        return idx === clampedStep ? 'current' : 'invalid'
      }
      if (idx === clampedStep) return 'current'
      if (idx < clampedStep) return 'done'
      return 'pending'
    })
  }, [controller.state.rows, invalidIdSet, clampedStep])

  function goNext() {
    if (clampedStep >= totalRows - 1) return
    directionRef.current = 'forward'
    void triggerHaptic('selection')
    setStepIndex(clampedStep + 1)
  }

  function goPrev() {
    if (clampedStep <= 0) return
    directionRef.current = 'back'
    void triggerHaptic('selection')
    setStepIndex(clampedStep - 1)
  }

  function jumpTo(idx: number) {
    if (idx === clampedStep) return
    directionRef.current = idx > clampedStep ? 'forward' : 'back'
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
    // noise" so we move on. Last step stays put (nothing to advance to);
    // the user reads the new state on screen and decides what to do.
    if (clampedStep < totalRows - 1) {
      directionRef.current = 'forward'
      setStepIndex(clampedStep + 1)
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
      const result = await confirm(controller.state.rows)
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
        const baseMsg = `Cargué ${parts.join(' y ')}.`
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

  // Build a stable key per step that ALSO bakes in row.id — if the user
  // skips a row mid-flow and the controller reorders/changes it, we
  // still re-mount cleanly. Direction is captured by entering/exiting.
  const stepKey = currentRow
    ? `${clampedStep}-${currentRow.id}`
    : `step-${clampedStep}`

  const wizardFooter = currentRow ? (
    <ImportReviewFooter
      stepIndex={clampedStep}
      totalSteps={totalRows}
      expensesCount={controller.submittableBreakdown.expenses}
      incomesCount={controller.submittableBreakdown.incomes}
      canConfirm={controller.canConfirm}
      isCurrentSkipped={currentRow.kind === 'skip'}
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
            stepIndex={clampedStep + 1}
            total={totalRows}
            imageUri={controller.state.imageUri}
          />
          <ImportReviewStepIndicator statuses={statuses} />

          <View style={styles.stepHost}>
            {currentRow ? (
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
              </Animated.View>
            ) : null}
          </View>

          {controller.state.unmatched > 0 ? (
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
  wrapper: { gap: 12, paddingBottom: 8 },
  stepHost: { marginTop: 4 },
  unmatched: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
})
