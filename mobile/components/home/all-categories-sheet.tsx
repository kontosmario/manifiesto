import { forwardRef, useImperativeHandle, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { BottomSheet, type BottomSheetHandle } from '@/components/ui/bottom-sheet'
import { CategoryBadge } from '@/components/ui/category-badge'
import { SelectableRow } from '@/components/ui/selectable-row'
import { AppButton } from '@/components/ui/button'
import type { Category } from '@/features/categories/use-categories'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface AllCategoriesSheetProps {
  categories: Category[]
  selectedCategoryId: string
  onSelect: (categoryId: string) => void
  onCreateNew?: () => void
}

export const AllCategoriesSheet = forwardRef<BottomSheetHandle, AllCategoriesSheetProps>(
  function AllCategoriesSheet(
    { categories, selectedCategoryId, onSelect, onCreateNew },
    ref,
  ) {
    const { theme } = useAppTheme()
    const sheetRef = useRef<BottomSheetHandle>(null)

    useImperativeHandle(
      ref,
      () => ({
        present: () => sheetRef.current?.present(),
        dismiss: () => sheetRef.current?.dismiss(),
        snapTo: (index: number) => sheetRef.current?.snapTo(index),
      }),
      [],
    )

    return (
      <BottomSheet ref={sheetRef} snapPoints={['75%', '95%']}>
        <View style={styles.content}>
          <Text style={[typography.sectionTitle, { color: theme.colors.text }]}>
            Todas las categorías
          </Text>
          <View style={styles.list}>
            {categories.map((category) => (
              <SelectableRow
                key={category.id}
                selected={category.id === selectedCategoryId}
                onPress={() => {
                  onSelect(category.id)
                  sheetRef.current?.dismiss()
                }}
                title={category.name}
                leading={<CategoryBadge categoryId={category.id} size="md" tone="soft" />}
              />
            ))}
          </View>
          {onCreateNew ? (
            <AppButton
              variant="secondary"
              label="＋ Crear categoría"
              onPress={() => {
                sheetRef.current?.dismiss()
                onCreateNew()
              }}
            />
          ) : null}
        </View>
      </BottomSheet>
    )
  },
)

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingBottom: 20,
  },
  list: {
    gap: 6,
  },
})
