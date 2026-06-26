import { useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui/button'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { CategoryEditorModal } from '@/components/settings/category-editor-modal'
import {
  type Category,
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
} from '@/features/categories/use-categories'
import {
  ALL_CATEGORIES_KEY,
  resolveManagedCategoryId,
  resolveSelectedCategoryId,
} from '@/features/expenses/expense-history'
import { useExpenseHistoryFilters } from '@/features/expenses/expense-history-filters.store'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { triggerHaptic } from '@/lib/haptics'
import { buildScreenHeaderPalette } from '@/theme/screen-header'
import { getIntlLocale } from '@/lib/i18n/active-locale'
import { withAlpha } from '@/theme/color-utils'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface ExpenseCategoriesScreenProps {
  familyId: string
}

export function ExpenseCategoriesScreen({ familyId }: ExpenseCategoriesScreenProps) {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const headerPalette = buildScreenHeaderPalette(theme)
  const categoriesQuery = useCategories(familyId)
  const expensesQuery = useExpenses(familyId)
  // userId via sesión activa — habilita la invalidación de home_snapshot
  // y control snapshots dentro de `syncAllAfterMutation` cuando se
  // crea/renombra/borra una categoría.
  const sessionUserId = useAuthSession().data?.user?.id
  const createCategoryMutation = useCreateCategory(familyId, sessionUserId)
  const renameCategoryMutation = useRenameCategory(familyId, sessionUserId)
  const deleteCategoryMutation = useDeleteCategory(familyId, sessionUserId)
  const filters = useExpenseHistoryFilters(familyId)
  const categoriesData = categoriesQuery.data
  const categories = useMemo(() => categoriesData ?? [], [categoriesData])
  const expensesData = expensesQuery.data
  const expenses = useMemo(() => expensesData ?? [], [expensesData])
  const selectedCategoryId = resolveSelectedCategoryId(categories, filters.categorySelection)
  const [categoryEditorMode, setCategoryEditorMode] = useState<'create' | 'rename' | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [categoryManagementSelection, setCategoryManagementSelection] = useState('')

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category] as const)),
    [categories],
  )
  const categoryExpenseCountById = useMemo(() => {
    const countById = new Map<string, number>()

    expenses.forEach((expense) => {
      countById.set(expense.category_id, (countById.get(expense.category_id) ?? 0) + 1)
    })

    return countById
  }, [expenses])
  const managedCategoryId = useMemo(
    () =>
      resolveManagedCategoryId({
        categories,
        fallbackCategoryId: selectedCategoryId,
        managedCategorySelection: categoryManagementSelection,
      }),
    [categories, categoryManagementSelection, selectedCategoryId],
  )
  const managedCategory = categoryById.get(managedCategoryId) ?? null
  const selectedCount = managedCategory ? categoryExpenseCountById.get(managedCategory.id) ?? 0 : 0
  const canDeleteManagedCategory = Boolean(managedCategory) && selectedCount === 0
  const isBusy =
    createCategoryMutation.isPending ||
    renameCategoryMutation.isPending ||
    deleteCategoryMutation.isPending

  const showError = (error: unknown, fallbackMessage: string) => {
    Alert.alert(t('gastos:errors.somethingWrong'), getErrorMessage(error, fallbackMessage))
  }

  return (
    <>
      <Screen
        canGoBack
        contentContainerStyle={styles.screenContent}
        subtitle={t('gastos:categoriesScreen.subtitle')}
        title={t('gastos:categoriesScreen.title')}
        titleColor={headerPalette.titleColor}
      >
        <View style={styles.sectionStack}>
          {!theme.isDark ? <AmbientBackdrop variant="form" /> : null}

          {categoriesQuery.isError && categories.length === 0 ? (
            <ErrorState
              description={getErrorMessage(
                categoriesQuery.error,
                t('gastos:categoriesScreen.loadErrorDescription'),
              )}
              title={t('gastos:categoriesScreen.loadErrorTitle')}
              onAction={() => {
                void Promise.all([categoriesQuery.refetch(), expensesQuery.refetch()])
              }}
            />
          ) : (
            <>
              <BrandedPanel style={styles.formCard}>
                <View style={styles.sectionIntro}>
                  <Text style={[styles.sectionEyebrow, { color: theme.colors.primaryStrong }]}>
                    {t('gastos:categoriesScreen.catalogEyebrow')}
                  </Text>
                  <Text style={[styles.sectionTitle, theme.typography.sectionTitle, { color: theme.colors.text }]}>
                    {t('gastos:categoriesScreen.catalogTitle')}
                  </Text>
                </View>

                <View
                  style={[
                    styles.selectionSummary,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.selectionLabel, { color: theme.colors.primaryStrong }]}>
                    {t('gastos:categoriesScreen.selectedLabel')}
                  </Text>
                  <Text style={[styles.selectionValue, { color: theme.colors.text }]}>
                    {managedCategory?.name ?? t('gastos:categoriesScreen.pickToManage')}
                  </Text>
                  <Text style={[styles.selectionMeta, theme.typography.bodySmall, { color: theme.colors.textMuted }]}>
                    {managedCategory
                      ? `${t('gastos:categoriesScreen.associatedExpenses', { count: selectedCount })}${selectedCategoryId === managedCategory.id ? t('gastos:categoriesScreen.usedInFilterSuffix') : ''}`
                      : t('gastos:categoriesScreen.tapRowHint')}
                  </Text>
                  {managedCategory && selectedCount > 0 ? (
                    <Text style={[styles.selectionWarning, { color: theme.colors.warning }]}>
                      {t('gastos:categoriesScreen.cannotDeleteWarning')}
                    </Text>
                  ) : null}
                </View>

                {categories.length === 0 ? (
                  <EmptyState icon="category" stateKey="categories" />
                ) : (
                  <View style={styles.categoryList}>
                    {categories.map((category) => (
                      <Pressable
                        accessibilityLabel={t('gastos:categoriesScreen.manageCategoryA11y', { name: category.name })}
                        accessibilityRole="button"
                        android_ripple={{
                          color: withAlpha(theme.colors.primary, 0.12),
                          borderless: false,
                        }}
                        key={category.id}
                        onPress={() => {
                          void triggerHaptic('selection')
                          setCategoryManagementSelection(category.id)
                        }}
                        style={({ pressed }) => [
                          styles.categoryItem,
                          {
                            backgroundColor:
                              managedCategory?.id === category.id
                                ? theme.colors.primarySurface
                                : theme.colors.surfaceMuted,
                            borderColor:
                              managedCategory?.id === category.id
                                ? theme.colors.primary
                                : theme.colors.border,
                            opacity: pressed ? 0.92 : 1,
                          },
                        ]}
                      >
                        <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                        <View style={styles.categoryCopy}>
                          <Text style={[styles.categoryName, { color: theme.colors.text }]}>
                            {category.name}
                          </Text>
                          <Text style={[styles.categoryMeta, { color: theme.colors.textMuted }]}>
                            {t('gastos:categoriesScreen.categoryMeta', {
                              count: categoryExpenseCountById.get(category.id) ?? 0,
                              date: new Date(category.created_at).toLocaleDateString(getIntlLocale()),
                            })}
                          </Text>
                        </View>
                        {selectedCategoryId === category.id ? (
                          <Text style={[styles.categoryBadge, { color: theme.colors.primaryStrong }]}>
                            {t('gastos:categoriesScreen.filterBadge')}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                )}
              </BrandedPanel>

              <View style={styles.actions}>
                <AppButton
                  label={t('gastos:categoriesScreen.newCategory')}
                  loading={createCategoryMutation.isPending}
                  onPress={() => {
                    setEditingCategory(null)
                    setCategoryEditorMode('create')
                  }}
                  variant="secondary"
                />
                <AppButton
                  disabled={!managedCategory}
                  label={t('gastos:categoriesScreen.renameSelected')}
                  loading={renameCategoryMutation.isPending}
                  onPress={() => {
                    if (!managedCategory) {
                      return
                    }

                    setEditingCategory(managedCategory)
                    setCategoryEditorMode('rename')
                  }}
                  variant="ghost"
                />
                <AppButton
                  disabled={!canDeleteManagedCategory}
                  label={t('gastos:categoriesScreen.deleteSelected')}
                  loading={deleteCategoryMutation.isPending}
                  onPress={() => {
                    if (!managedCategory || !canDeleteManagedCategory) {
                      return
                    }

                    Alert.alert(
                      t('gastos:categoriesScreen.deleteAlertTitle'),
                      t('gastos:categoriesScreen.deleteAlertMessage', { name: managedCategory.name }),
                      [
                        { style: 'cancel', text: t('common:actions.cancel') },
                        {
                          style: 'destructive',
                          text: t('gastos:history.deleteConfirm'),
                          onPress: () => {
                            deleteCategoryMutation.mutate(managedCategory.id, {
                              onError: (error: unknown) => {
                                showError(error, t('gastos:categoriesScreen.deleteFailed'))
                              },
                              onSuccess: () => {
                                if (selectedCategoryId === managedCategory.id) {
                                  filters.setCategorySelection(ALL_CATEGORIES_KEY)
                                }
                                setCategoryManagementSelection((current) =>
                                  current === managedCategory.id ? '' : current,
                                )
                              },
                            })
                          },
                        },
                      ],
                    )
                  }}
                  variant="danger"
                />
              </View>
            </>
          )}
        </View>
      </Screen>

      {categoryEditorMode === 'create' ? (
        <CategoryEditorModal
          isBusy={isBusy}
          key="category-editor-create"
          onClose={() => setCategoryEditorMode(null)}
          onSubmit={async (name: string) => {
            await createCategoryMutation.mutateAsync(name, {
              onError: (error: unknown) => {
                showError(error, t('gastos:categoriesScreen.createFailed'))
              },
              onSuccess: () => {
                setCategoryEditorMode(null)
              },
            })
          }}
          submitLabel={t('gastos:categoriesScreen.create')}
          title={t('gastos:categoriesScreen.newCategory')}
          visible
        />
      ) : null}

      {categoryEditorMode === 'rename' && editingCategory ? (
        <CategoryEditorModal
          initialValue={editingCategory.name}
          isBusy={isBusy}
          key={`category-editor-rename-${editingCategory.id}-${editingCategory.name}`}
          onClose={() => setCategoryEditorMode(null)}
          onSubmit={async (name: string) => {
            await renameCategoryMutation.mutateAsync(
              {
                categoryId: editingCategory.id,
                name,
              },
              {
                onError: (error: unknown) => {
                  showError(error, t('gastos:categoriesScreen.renameFailed'))
                },
                onSuccess: () => {
                  setCategoryEditorMode(null)
                },
              },
            )
          }}
          submitLabel={t('common:actions.save')}
          title={t('gastos:categoriesScreen.renameTitle')}
          visible
        />
      ) : null}
    </>
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
  formCard: {
    gap: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  sectionIntro: {
    gap: 4,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionTitle: {},
  selectionSummary: {
    gap: 6,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  selectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  selectionValue: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  selectionMeta: {},
  selectionWarning: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  categoryList: {
    gap: 14,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: radii.pill,
  },
  categoryCopy: {
    flex: 1,
    gap: 2,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '800',
  },
  categoryMeta: {
    fontSize: 12,
    lineHeight: 17,
  },
  categoryBadge: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  actions: {
    gap: 12,
  },
})
