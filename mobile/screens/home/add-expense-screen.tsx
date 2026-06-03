import { useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AddExpenseDashboard } from '@/components/home/add-expense-dashboard'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { useAddExpenseController } from '@/features/expenses/use-add-expense-controller'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import { errorMessages } from '@/lib/copy/states'
import { buildScreenHeaderPalette } from '@/theme/screen-header'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface AddExpenseScreenProps {
  familyId: string
  userId: string
}

/**
 * Parses a back-date param shaped as `YYYY-MM-DD` into a local-midnight
 * Date. Returns null when the string is missing, malformed, or resolves
 * to a day in the future (guards against deep-link abuse). Used by the
 * Gastos calendar's "registrar gasto olvidado" entry point.
 */
function parseBackdateParam(raw: string | string[] | undefined): Date | null {
  if (typeof raw !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (date.getTime() > today.getTime()) return null
  return date
}

export function AddExpenseScreen({ familyId, userId }: AddExpenseScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const params = useLocalSearchParams<{ date?: string | string[] }>()
  const forDate = useMemo(() => parseBackdateParam(params.date), [params.date])
  const controller = useAddExpenseController({
    familyId,
    onCreated: () => {
      router.back()
    },
    userId,
    forDate,
  })
  // Advisor signals are reused from the cached `useControlV2Data`
  // query, so this hook adds no extra network. The dashboard renders
  // an inline banner when the selected category has a relevant alert
  // or when today is already over cupo.
  const { signals: advisorSignals } = useControlV2Data(familyId)

  const headerPalette = buildScreenHeaderPalette(theme)
  const categoriesLoadError = controller.categoriesQuery.error
  const shouldShowErrorState = Boolean(
    categoriesLoadError && !controller.categoriesQuery.data,
  )
  const hasNoCategories =
    !controller.categoriesQuery.isLoading && controller.categories.length === 0

  return (
    <Screen
      canGoBack
      showGrabHandle
      contentContainerStyle={styles.screenContent}
      title="Agregar gasto"
      titleColor={headerPalette.titleColor}
    >
      {!theme.isDark ? <AmbientBackdrop variant="form" /> : null}

      {shouldShowErrorState ? (
        <ErrorState
          description={getErrorMessage(categoriesLoadError, errorMessages.server)}
          title="No pudimos abrir el formulario"
          onAction={() => {
            void controller.categoriesQuery.refetch()
          }}
        />
      ) : hasNoCategories ? (
        <EmptyState
          stateKey="categories"
          icon="category"
          action={{
            label: 'Crear categoría',
            onPress: () => router.push('/(app)/(tabs)/expenses'),
          }}
        />
      ) : (
        <AddExpenseDashboard
          amount={controller.amount}
          rawPrice={controller.rawPrice}
          rankedCategories={controller.rankedCategories}
          selectedCategoryId={controller.selectedCategoryId}
          suggestedAmounts={controller.suggestedAmounts}
          quickDescriptionSuggestions={controller.quickDescriptionSuggestions}
          description={controller.description}
          notes={controller.notes}
          isBusy={controller.createExpenseMutation.isPending}
          forDate={controller.forDate}
          advisorSignals={advisorSignals}
          missingFields={controller.missingFields}
          highlightToken={controller.highlightToken}
          onFlagMissingFields={controller.actions.flagMissingFields}
          onRawPriceChange={controller.actions.setRawPrice}
          onAddQuickAmount={controller.actions.addQuickAmount}
          onClearAmount={controller.actions.clearAmount}
          onSelectCategory={controller.actions.selectCategory}
          onSelectDescriptionSuggestion={controller.actions.useQuickDescription}
          onDescriptionChange={controller.actions.setDescription}
          onNotesChange={controller.actions.setNotes}
          onSubmit={controller.submitExpense}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
})
