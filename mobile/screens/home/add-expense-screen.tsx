import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AddExpenseForm } from '@/components/home/add-expense-form'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { Screen } from '@/components/ui/screen'
import { useAddExpenseController } from '@/features/expenses/use-add-expense-controller'
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
      router.replace('/(app)/(tabs)/expenses')
    },
    userId,
  })

  const headerPalette = buildScreenHeaderPalette(theme)
  const categoriesLoadError = controller.categoriesQuery.error
  const shouldShowErrorState = Boolean(
    categoriesLoadError && !controller.categoriesQuery.data,
  )

  return (
    <Screen
      canGoBack
      contentContainerStyle={styles.screenContent}
      rightSlot={
        <View style={styles.headerActions}>
          <IconButton
            accessibilityLabel="Ver historial"
            backgroundColor={headerPalette.buttonBackgroundColor}
            borderColor={headerPalette.buttonBorderColor}
            icon="receipt-long"
            iconColor={headerPalette.iconColor}
            symbolName="clock.arrow.circlepath"
            onPress={() => router.push('/(app)/expenses-history')}
          />
        </View>
      }
      title="Agregar gasto"
      titleColor={headerPalette.titleColor}
    >
      <View style={styles.sectionStack}>
        {!theme.isDark ? (
          <AmbientBackdrop variant="form" />
        ) : null}

        {shouldShowErrorState ? (
          <ErrorState
            description={getErrorMessage(
              categoriesLoadError,
              'No pudimos cargar las categorías necesarias para registrar el gasto.',
            )}
            title="No pudimos abrir el formulario"
            onAction={() => {
              void controller.categoriesQuery.refetch()
            }}
          />
        ) : (
          <AddExpenseForm
            amount={controller.amount}
            amountHelper={controller.amountHelper}
            categories={controller.categories}
            description={controller.description}
            hasValidAmount={controller.hasValidAmount}
            isBusy={controller.createExpenseMutation.isPending}
            isCategoriesLoading={controller.categoriesQuery.isLoading}
            isPriceFocused={controller.isPriceFocused}
            normalizeSuggestionLabel={controller.normalizeSuggestionLabel}
            onDescriptionChange={controller.actions.setDescription}
            onPriceBlur={() => controller.actions.setPriceFocused(false)}
            onPriceChange={controller.actions.setPrice}
            onPriceFocus={() => controller.actions.setPriceFocused(true)}
            onSelectCategory={controller.actions.selectCategory}
            onSelectDescriptionSuggestion={controller.actions.useQuickDescription}
            onSelectSuggestedAmount={controller.actions.setSuggestedAmount}
            onSubmit={controller.submitExpense}
            price={controller.price}
            quickDescriptionSuggestions={controller.quickDescriptionSuggestions}
            selectedCategoryId={controller.selectedCategoryId}
            suggestedAmounts={controller.suggestedAmounts}
          />
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  sectionStack: {
    gap: 18,
    position: 'relative',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})
