import { useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
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
import { withAlpha } from '@/theme/color-utils'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface ExpenseCategoriesScreenProps {
  familyId: string
}

export function ExpenseCategoriesScreen({ familyId }: ExpenseCategoriesScreenProps) {
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
    Alert.alert('Algo salió mal', getErrorMessage(error, fallbackMessage))
  }

  return (
    <>
      <Screen
        canGoBack
        contentContainerStyle={styles.screenContent}
        subtitle="Administrá el catálogo con la misma experiencia modal de Agregar gasto."
        title="Categorias"
        titleColor={headerPalette.titleColor}
      >
        <View style={styles.sectionStack}>
          {!theme.isDark ? <AmbientBackdrop variant="form" /> : null}

          {categoriesQuery.isError && categories.length === 0 ? (
            <ErrorState
              description={getErrorMessage(
                categoriesQuery.error,
                'No pudimos cargar las categorias del hogar.',
              )}
              title="No pudimos abrir categorías"
              onAction={() => {
                void Promise.all([categoriesQuery.refetch(), expensesQuery.refetch()])
              }}
            />
          ) : (
            <>
              <BrandedPanel style={styles.formCard}>
                <View style={styles.sectionIntro}>
                  <Text style={[styles.sectionEyebrow, { color: theme.colors.primaryStrong }]}>
                    Catalogo
                  </Text>
                  <Text style={[styles.sectionTitle, theme.typography.sectionTitle, { color: theme.colors.text }]}>
                    Ordená cómo se clasifica el gasto
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
                    Categoría seleccionada
                  </Text>
                  <Text style={[styles.selectionValue, { color: theme.colors.text }]}>
                    {managedCategory?.name ?? 'Elige una categoría para administrarla'}
                  </Text>
                  <Text style={[styles.selectionMeta, theme.typography.bodySmall, { color: theme.colors.textMuted }]}>
                    {managedCategory
                      ? `${selectedCount} ${
                          selectedCount === 1 ? 'gasto asociado' : 'gastos asociados'
                        }${selectedCategoryId === managedCategory.id ? ' · usada en el filtro actual' : ''}`
                      : 'Toca una fila para renombrar o borrar la categoría correcta.'}
                  </Text>
                  {managedCategory && selectedCount > 0 ? (
                    <Text style={[styles.selectionWarning, { color: theme.colors.warning }]}>
                      Esta categoría no se puede borrar porque ya tiene movimientos.
                    </Text>
                  ) : null}
                </View>

                {categories.length === 0 ? (
                  <EmptyState icon="category" stateKey="categories" />
                ) : (
                  <View style={styles.categoryList}>
                    {categories.map((category) => (
                      <Pressable
                        accessibilityLabel={`Gestionar categoría ${category.name}`}
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
                            {`${categoryExpenseCountById.get(category.id) ?? 0} ${
                              (categoryExpenseCountById.get(category.id) ?? 0) === 1
                                ? 'gasto'
                                : 'gastos'
                            } · creada ${new Date(category.created_at).toLocaleDateString('es-AR')}`}
                          </Text>
                        </View>
                        {selectedCategoryId === category.id ? (
                          <Text style={[styles.categoryBadge, { color: theme.colors.primaryStrong }]}>
                            Filtro
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                )}
              </BrandedPanel>

              <View style={styles.actions}>
                <AppButton
                  label="Nueva categoria"
                  loading={createCategoryMutation.isPending}
                  onPress={() => {
                    setEditingCategory(null)
                    setCategoryEditorMode('create')
                  }}
                  variant="secondary"
                />
                <AppButton
                  disabled={!managedCategory}
                  label="Renombrar seleccionada"
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
                  label="Borrar seleccionada"
                  loading={deleteCategoryMutation.isPending}
                  onPress={() => {
                    if (!managedCategory || !canDeleteManagedCategory) {
                      return
                    }

                    Alert.alert(
                      'Borrar categoria',
                      `Se va a borrar "${managedCategory.name}" si no tiene gastos cargados.`,
                      [
                        { style: 'cancel', text: 'Cancelar' },
                        {
                          style: 'destructive',
                          text: 'Borrar',
                          onPress: () => {
                            deleteCategoryMutation.mutate(managedCategory.id, {
                              onError: (error: unknown) => {
                                showError(error, 'No se pudo borrar la categoria.')
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
                showError(error, 'No se pudo crear la categoria.')
              },
              onSuccess: () => {
                setCategoryEditorMode(null)
              },
            })
          }}
          submitLabel="Crear"
          title="Nueva categoria"
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
                  showError(error, 'No se pudo renombrar la categoria.')
                },
                onSuccess: () => {
                  setCategoryEditorMode(null)
                },
              },
            )
          }}
          submitLabel="Guardar"
          title="Renombrar categoria"
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
