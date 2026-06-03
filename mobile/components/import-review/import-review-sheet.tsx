import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
} from 'react-native-reanimated'
import { ModalCard } from '@/components/ui/modal-card'
import { useAppTheme } from '@/theme/theme-provider'
import { useCategories } from '@/features/categories/use-categories'
import { toast } from '@/lib/toast-bus'
import { confetti } from '@/lib/confetti-bus'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { useImportReviewController } from '@/features/import-review/use-import-review-controller'
import { useConfirmImport } from '@/features/import-review/use-confirm-import'
import { formatISO } from '@/features/import-review/cycle-date-math'
import type { ReviewState } from '@/features/import-review/types'
import { ImportReviewRow } from './import-review-row'
import { ImportReviewFooter } from './import-review-footer'
import { ImportReviewEmpty } from './import-review-empty'
import { ImportReviewHeader } from './import-review-header'

interface Props {
  visible: boolean
  initialState: ReviewState | null
  familyId: string
  userId: string
  onClose: () => void
}

const ROW_STAGGER_MS = 40
const CONFIRM_FADE_MS = 180
const CONFIRM_STAGGER_MS = 50
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
  // Compute cycleDays from start/end. PayCycle window is [start, end).
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

  useEffect(() => {
    if (initialState) controller.replaceState(initialState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialState])

  const totalRows = controller.state.rows.length

  async function handleConfirm() {
    setBusy(true)
    try {
      const result = await confirm(controller.state.rows)
      const total = result.insertedExpenses + result.insertedIncomes

      // Cinematic fade-out: trigger the staggered exit, then await
      // long enough that the user sees the rows leave before close.
      setFadingOut(true)
      const fadeoutDurationMs =
        controller.state.rows.length * CONFIRM_STAGGER_MS + CONFIRM_FADE_MS + 80
      await new Promise<void>((resolve) =>
        setTimeout(resolve, fadeoutDurationMs),
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

        if (total >= 5) {
          confetti.celebrate({ durationMs: 2200, origin: 'top' })
        }
      } else if (result.failed.length > 0) {
        toast.error(
          `No se pudo cargar ningún movimiento (${result.failed.length} errores).`,
          { durationMs: 6000 },
        )
      }
      onClose()
    } finally {
      setBusy(false)
      setFadingOut(false)
    }
  }

  return (
    <ModalCard
      visible={visible}
      onClose={busy ? () => {} : onClose}
      title=""
      subtitle=""
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <ImportReviewHeader
          transactionsCount={totalRows}
          breakdown={controller.submittableBreakdown}
          skipCount={controller.skippedCount}
          imageUri={controller.state.imageUri}
        />

        {totalRows === 0 ? (
          <ImportReviewEmpty />
        ) : (
          <View style={styles.rows}>
            {controller.state.rows.map((row, idx) => {
              const entering = FadeInDown.duration(220).delay(
                Math.min(idx, 7) * ROW_STAGGER_MS,
              ).easing(EASE_IOS)
              const exiting = fadingOut
                ? FadeOutUp.duration(CONFIRM_FADE_MS).delay(
                    idx * CONFIRM_STAGGER_MS,
                  ).easing(EASE_IOS)
                : undefined
              return (
                <Animated.View
                  key={row.id}
                  entering={entering}
                  exiting={exiting}
                >
                  <ImportReviewRow
                    row={row}
                    categories={categories}
                    invalid={controller.invalidIds.includes(row.id)}
                    cycleStart={payCycle.cycle.start}
                    cycleDays={cycleDays}
                    today={today}
                    onSetKind={(kind) =>
                      controller.setRowKind(row.id, kind)
                    }
                    onPatch={(patch) => controller.patchRow(row.id, patch)}
                    onUnskip={() => controller.unskipRow(row.id)}
                  />
                </Animated.View>
              )
            })}
            {controller.state.unmatched > 0 ? (
              <Text
                style={[styles.unmatched, { color: theme.colors.textMuted }]}
              >
                {`${controller.state.unmatched} líneas no se pudieron clasificar.`}
              </Text>
            ) : null}
          </View>
        )}

        <View style={styles.footerSlot}>
          <ImportReviewFooter
            expensesCount={controller.submittableBreakdown.expenses}
            incomesCount={controller.submittableBreakdown.incomes}
            canConfirm={controller.canConfirm}
            busy={busy}
            onConfirm={handleConfirm}
            onCancel={busy ? () => {} : onClose}
          />
        </View>
      </ScrollView>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  scroll: { maxHeight: '100%' },
  scrollContent: { gap: 12, paddingBottom: 24 },
  rows: { gap: 12 },
  unmatched: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
  footerSlot: { marginTop: 16 },
})
