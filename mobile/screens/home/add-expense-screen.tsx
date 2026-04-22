import { StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { AddExpenseDashboard } from '@/components/home/add-expense-dashboard'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { useAddExpenseController } from '@/features/expenses/use-add-expense-controller'
import { errorMessages } from '@/lib/copy/states'
import { buildScreenHeaderPalette } from '@/theme/screen-header'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface AddExpenseScreenProps {
  familyId: string
  userId: string
}

export function AddExpenseScreen({ familyId, userId }: AddExpenseScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const controller = useAddExpenseController({
    familyId,
    onCreated: () => {
      router.back()
    },
    userId,
  })

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
      scrollable={false}
      keyboardAware={false}
      contentContainerStyle={styles.screenContent}
      title="Agregar"
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
          hasValidAmount={controller.hasValidAmount}
          amountHelper={controller.amountHelper}
          rawPrice={controller.rawPrice}
          rankedCategories={controller.rankedCategories}
          selectedCategoryId={controller.selectedCategoryId}
          suggestedAmounts={controller.suggestedAmounts}
          quickDescriptionSuggestions={controller.quickDescriptionSuggestions}
          description={controller.description}
          isBusy={controller.createExpenseMutation.isPending}
          onRawPriceChange={controller.actions.setRawPrice}
          onSelectSuggestedAmount={controller.actions.setSuggestedAmount}
          onSelectCategory={controller.actions.selectCategory}
          onSelectDescriptionSuggestion={controller.actions.useQuickDescription}
          onDescriptionChange={controller.actions.setDescription}
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
