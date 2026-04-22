import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
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

  // Keep the selected category visible in the grid even when it isn't in the
  // top-ranked subset (e.g. the user picked it from "Ver todas"). It lands in
  // first position, acting as the "most recently used" anchor.
  const gridCategories = useMemo(() => {
    if (!selectedCategoryId) return rankedCategories
    const selected = rankedCategories.find((c) => c.id === selectedCategoryId)
    if (!selected) return rankedCategories
    const GRID_LIMIT = 8
    const topN = rankedCategories.slice(0, GRID_LIMIT)
    if (topN.some((c) => c.id === selectedCategoryId)) return rankedCategories
    const rest = rankedCategories.filter((c) => c.id !== selectedCategoryId)
    return [selected, ...rest]
  }, [rankedCategories, selectedCategoryId])

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
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
          categories={gridCategories}
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
      </ScrollView>

      <StickyFooter divider={false}>
        <AppButton
          label="Guardar gasto"
          variant="primary"
          loading={isBusy}
          disabled={!hasValidAmount || !selectedCategoryId}
          onPress={onSubmit}
        />
      </StickyFooter>

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
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 14,
    paddingBottom: 8,
  },
  helper: {
    paddingHorizontal: 4,
  },
  error: {
    paddingHorizontal: 4,
  },
})
