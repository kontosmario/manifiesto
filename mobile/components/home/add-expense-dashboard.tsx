import { useEffect, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AmountCard } from '@/components/home/amount-card'
import { AllCategoriesSheet } from '@/components/home/all-categories-sheet'
import { CategoryPickerGrid } from '@/components/home/category-picker-grid'
import { DescriptionRow } from '@/components/home/description-row'
import { SuggestedAmountStrip } from '@/components/home/suggested-amount-strip'
import { AppButton } from '@/components/ui/button'
import { type BottomSheetHandle } from '@/components/ui/bottom-sheet'
import { InAppNumpad, type InAppNumpadHandle } from '@/components/ui/in-app-numpad'
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
  const numpadRef = useRef<InAppNumpadHandle>(null)
  const allCategoriesRef = useRef<BottomSheetHandle>(null)
  const didAutoPresent = useRef(false)

  useEffect(() => {
    if (didAutoPresent.current) return
    didAutoPresent.current = true
    const handle = setTimeout(() => numpadRef.current?.present(), 250)
    return () => clearTimeout(handle)
  }, [])

  return (
    <View style={styles.root}>
      <View style={styles.topStack}>
        <AmountCard
          amount={amount}
          isActive={false}
          onPress={() => numpadRef.current?.present()}
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
          onSeeAll={() => allCategoriesRef.current?.present()}
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
        ref={numpadRef}
        rawValue={rawPrice}
        onChangeRawValue={onRawPriceChange}
      />

      <AllCategoriesSheet
        ref={allCategoriesRef}
        categories={rankedCategories}
        selectedCategoryId={selectedCategoryId}
        onSelect={onSelectCategory}
        onCreateNew={onCreateCategory}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topStack: {
    gap: 14,
  },
  footerWrap: {
    marginTop: 'auto',
  },
  helper: {
    paddingHorizontal: 4,
  },
  error: {
    paddingHorizontal: 4,
  },
})
