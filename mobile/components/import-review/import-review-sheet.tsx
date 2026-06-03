import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { ModalCard } from '@/components/ui/modal-card'
import { useAppTheme } from '@/theme/theme-provider'
import { useCategories } from '@/features/categories/use-categories'
import { toast } from '@/lib/toast-bus'
import { useImportReviewController } from '@/features/import-review/use-import-review-controller'
import { useConfirmImport } from '@/features/import-review/use-confirm-import'
import type { ReviewState } from '@/features/import-review/types'
import { ImportReviewRow } from './import-review-row'
import { ImportReviewFooter } from './import-review-footer'
import { ImportReviewEmpty } from './import-review-empty'

interface Props {
  visible: boolean
  initialState: ReviewState | null
  familyId: string
  userId: string
  onClose: () => void
}

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
  const [busy, setBusy] = useState(false)

  // When a new initialState arrives (new captura), replace the controller state.
  useEffect(() => {
    if (initialState) controller.replaceState(initialState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialState])

  const totalRows = controller.state.rows.length
  const summary =
    totalRows === 0
      ? 'No detecté nada'
      : `Detecté ${totalRows} ${totalRows === 1 ? 'movimiento' : 'movimientos'}.`

  async function handleConfirm() {
    setBusy(true)
    try {
      const result = await confirm(controller.state.rows)
      const total = result.insertedExpenses + result.insertedIncomes
      if (total > 0) {
        const parts: string[] = []
        if (result.insertedExpenses > 0) {
          parts.push(`${result.insertedExpenses} gasto${result.insertedExpenses === 1 ? '' : 's'}`)
        }
        if (result.insertedIncomes > 0) {
          parts.push(`${result.insertedIncomes} ingreso${result.insertedIncomes === 1 ? '' : 's'}`)
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
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalCard
      visible={visible}
      onClose={busy ? () => {} : onClose}
      title="Revisar importación"
      subtitle={summary}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {totalRows === 0 ? (
          <ImportReviewEmpty />
        ) : (
          <View style={styles.rows}>
            {controller.state.rows.map((row) => (
              <ImportReviewRow
                key={row.id}
                row={row}
                categories={categories}
                invalid={controller.invalidIds.includes(row.id)}
                onSetKind={(kind) => controller.setRowKind(row.id, kind)}
                onPatch={(patch) => controller.patchRow(row.id, patch)}
                onUnskip={() => controller.unskipRow(row.id)}
              />
            ))}
            {controller.state.unmatched > 0 ? (
              <Text style={[styles.unmatched, { color: theme.colors.textMuted }]}>
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
  unmatched: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 6 },
  footerSlot: { marginTop: 16 },
})
