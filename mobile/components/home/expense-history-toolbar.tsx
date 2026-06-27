import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { IconButton } from '@/components/ui/icon-button'

interface ExpenseHistoryToolbarProps {
  buttonBackgroundColor: string
  buttonBorderColor: string
  filtersAreDirty: boolean
  iconColor: string
  onOpenCategories: () => void
  onOpenFilters: () => void
}

export function ExpenseHistoryToolbar({
  buttonBackgroundColor,
  buttonBorderColor,
  filtersAreDirty,
  iconColor,
  onOpenCategories,
  onOpenFilters,
}: ExpenseHistoryToolbarProps) {
  const { t } = useTranslation()
  return (
    <View style={styles.headerActions}>
      <IconButton
        accessibilityLabel={t('home:historyToolbar.openFilters')}
        backgroundColor={buttonBackgroundColor}
        badgeColor={iconColor}
        borderColor={buttonBorderColor}
        icon="filter-list"
        iconColor={iconColor}
        showBadge={filtersAreDirty}
        symbolName="line.3.horizontal.decrease.circle"
        onPress={onOpenFilters}
      />
      <IconButton
        accessibilityLabel={t('home:historyToolbar.manageCategories')}
        backgroundColor={buttonBackgroundColor}
        borderColor={buttonBorderColor}
        icon="tune"
        iconColor={iconColor}
        symbolName="slider.horizontal.3"
        onPress={onOpenCategories}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})
