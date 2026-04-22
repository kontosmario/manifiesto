import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AmountCard } from '@/components/home/amount-card'
import { AllCategoriesSheet } from '@/components/home/all-categories-sheet'
import { CategoryPickerGrid } from '@/components/home/category-picker-grid'
import { DescriptionRow } from '@/components/home/description-row'
import { SuggestedAmountStrip } from '@/components/home/suggested-amount-strip'
import { AppButton } from '@/components/ui/button'
import { InAppNumpad } from '@/components/ui/in-app-numpad'
import { StickyFooter } from '@/components/ui/sticky-footer'
import type { Category } from '@/features/categories/use-categories'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface AddExpenseDashboardProps {
  amount: number
  hasValidAmount: boolean
  amountHelper?: string
  rawPrice: string
  rankedCategories: Category[]
  selectedCategoryId: string
  suggestedAmounts: number[]
  quickDescriptionSuggestions: string[]
  description: string
  isBusy: boolean
  submitErrorMessage?: string | null
  onRawPriceChange: (value: string) => void
  onSelectSuggestedAmount: (value: number) => void
  onSelectCategory: (categoryId: string) => void
  onSelectDescriptionSuggestion: (value: string) => void
  onDescriptionChange: (value: string) => void
  onCreateCategory?: () => void
  onSubmit: () => void
}

export function AddExpenseDashboard({
  amount,
  hasValidAmount,
  amountHelper,
  rawPrice,
  rankedCategories,
  selectedCategoryId,
  suggestedAmounts,
  quickDescriptionSuggestions,
  description,
  isBusy,
  submitErrorMessage,
  onRawPriceChange,
  onSelectSuggestedAmount,
  onSelectCategory,
  onSelectDescriptionSuggestion,
  onDescriptionChange,
  onCreateCategory,
  onSubmit,
}: AddExpenseDashboardProps) {
  const { theme } = useAppTheme()
  const [numpadVisible, setNumpadVisible] = useState(false)
  const [allCategoriesVisible, setAllCategoriesVisible] = useState(false)

  useEffect(() => {
    const handle = setTimeout(() => setNumpadVisible(true), 350)
    return () => clearTimeout(handle)
  }, [])

  return (
    <View style={styles.root}>
      <View style={styles.topStack}>
        <AmountCard
          amount={amount}
          isActive={numpadVisible}
          onPress={() => setNumpadVisible(true)}
        />

        <SuggestedAmountStrip
          amounts={suggestedAmounts}
          currentAmount={amount}
          onSelect={onSelectSuggestedAmount}
        />

        {amountHelper ? (
          <Text
            style={[typography.caption, styles.helper, { color: theme.colors.textMuted }]}
          >
            {amountHelper}
          </Text>
        ) : null}

        <CategoryPickerGrid
          categories={rankedCategories}
          selectedCategoryId={selectedCategoryId}
          onSelect={onSelectCategory}
          onSeeAll={() => setAllCategoriesVisible(true)}
        />

        <DescriptionRow
          description={description}
          onChange={onDescriptionChange}
          quickSuggestions={quickDescriptionSuggestions}
          onSelectSuggestion={onSelectDescriptionSuggestion}
        />

        {submitErrorMessage ? (
          <Text
            style={[typography.caption, styles.error, { color: theme.colors.danger }]}
          >
            {submitErrorMessage}
          </Text>
        ) : null}
      </View>

      <View style={styles.footerWrap}>
        <StickyFooter divider={false}>
          <AppButton
            label="Guardar gasto"
            variant="primary"
            loading={isBusy}
            disabled={!hasValidAmount || !selectedCategoryId}
            onPress={onSubmit}
          />
        </StickyFooter>
      </View>

      <InAppNumpad
        visible={numpadVisible}
        rawValue={rawPrice}
        onChangeRawValue={onRawPriceChange}
        onDismiss={() => setNumpadVisible(false)}
      />

      <AllCategoriesSheet
        visible={allCategoriesVisible}
        categories={rankedCategories}
        selectedCategoryId={selectedCategoryId}
        onSelect={onSelectCategory}
        onDismiss={() => setAllCategoriesVisible(false)}
        onCreateNew={onCreateCategory}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
  },
  topStack: {
    gap: 14,
  },
  footerWrap: {
    marginTop: 8,
  },
  helper: {
    paddingHorizontal: 4,
  },
  error: {
    paddingHorizontal: 4,
  },
})
