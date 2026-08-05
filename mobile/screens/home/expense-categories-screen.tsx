import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoStateBlock } from '@/components/ui/neo-state-block'
import { NeoSurface } from '@/components/ui/neo-surface'
import { Screen } from '@/components/ui/screen'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
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
import { neoConfirm } from '@/lib/confirm-bus'
import { toast } from '@/lib/toast-bus'
import { triggerHaptic } from '@/lib/haptics'
import { getIntlLocale } from '@/lib/i18n/active-locale'
import {
  neoCategoryPastels,
  neoRadii,
  neoTokens,
  pastelDarkSolid,
} from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface ExpenseCategoriesScreenProps {
  familyId: string
}

const PASTELS = Object.values(neoCategoryPastels)

/**
 * Pastel de categoría DETERMINISTA. El catálogo no expone un slug que
 * mapee 1:1 contra las 12 claves de `neoCategoryPastels`, así que el
 * puente es un hash estable del nombre CRUDO: la misma categoría cae
 * siempre en el mismo pastel y `category.color` (colores saturados del
 * catálogo V1, que el owner rechaza) deja de pintarse.
 */
function categoryPastel(seed: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }
  return PASTELS[Math.abs(hash) % PASTELS.length]
}

export function ExpenseCategoriesScreen({ familyId }: ExpenseCategoriesScreenProps) {
  const { t } = useTranslation()
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const isDark = theme.mode === 'dark'
  // `neo.green` es el verde de MATERIAL. Como TINTA a 11-15pt sobre el pozo
  // claro da 4.29:1 y sobre el tile seleccionado 3.97:1 — los dos bajo AA;
  // `greenDeep` ahí da 7.4:1 / 6.8:1. En oscuro el verde claro ya cumple y
  // `greenDeep` sería ilegible, así que la tinta es mode-aware.
  const accentInk = isDark ? neo.green : neo.greenDeep
  // Alerta blanda: `neo.warm` (#C96F3F) sobre el pozo claro da 2.99:1 a 12pt.
  // Se usa el rojo-tierra de exceso del propio rediseño (4.72:1).
  const warnInk = isDark ? neo.warm : '#A84A2F'
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
  // Solo las categorías CUSTOM (sin template_id) se editan/borran. Las standard
  // son del catálogo global (read-only). Ver category-architecture-refactor.md.
  const isManagedCustom = Boolean(managedCategory) && managedCategory?.template_id == null
  const canRenameManagedCategory = isManagedCustom
  const canDeleteManagedCategory = isManagedCustom && selectedCount === 0
  const isBusy =
    createCategoryMutation.isPending ||
    renameCategoryMutation.isPending ||
    deleteCategoryMutation.isPending

  // Android < API 28/29 descarta el `boxShadow` EN SILENCIO. Sin él el tile
  // de categoría pierde el anillo que marca la selección y los sub-relieves
  // quedan del mismo material que la card. Contorno de 1px como piso.
  const flatFallback = useMemo<ViewStyle | null>(
    () => (SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider }),
    [neo],
  )

  // El `Alert.alert` de UN botón es el toast del rediseño (host global, que
  // sobrevive al unmount de la pantalla igual que sobrevivía el diálogo del
  // sistema).
  const showError = (error: unknown, fallbackMessage: string) => {
    toast.error(getErrorMessage(error, fallbackMessage))
  }

  return (
    <>
      <Screen
        backgroundColor={neo.bg}
        canGoBack
        contentContainerStyle={styles.screenContent}
        // `expense-categories` se registra con `presentation: 'modal'`
        // (`app-stack-shell.tsx`): en iOS es una hoja que arranca debajo de la
        // isla, así que el inset superior del DISPOSITIVO no le corresponde.
        // En Android la ruta es `card` y el flag se ignora. Ver el docblock de
        // `presentedAsSheet`.
        presentedAsSheet
        subtitle={t('gastos:categoriesScreen.subtitle')}
        title={t('gastos:categoriesScreen.title')}
        titleColor={neo.text}
      >
        <View style={styles.sectionStack}>
          {categoriesQuery.isError && categories.length === 0 ? (
            <NeoStateBlock
              actionLabel={t('states:errorState.action')}
              description={getErrorMessage(
                categoriesQuery.error,
                t('gastos:categoriesScreen.loadErrorDescription'),
              )}
              icon="error-outline"
              onAction={() => {
                void Promise.all([categoriesQuery.refetch(), expensesQuery.refetch()])
              }}
              title={t('gastos:categoriesScreen.loadErrorTitle')}
              tone="error"
            />
          ) : (
            <>
              <NeoSurface radius={neoRadii.card} style={styles.formCard} variant="raisedLg">
                <View style={styles.sectionIntro}>
                  <Text style={[styles.sectionEyebrow, { color: accentInk }]}>
                    {t('gastos:categoriesScreen.catalogEyebrow')}
                  </Text>
                  <Text style={[styles.sectionTitle, { color: neo.text }]}>
                    {t('gastos:categoriesScreen.catalogTitle')}
                  </Text>
                </View>

                <NeoSurface
                  backgroundColor={neo.well}
                  radius={neoRadii.tile}
                  style={[styles.selectionSummary, flatFallback]}
                  variant="insetMd"
                >
                  <Text style={[styles.selectionLabel, { color: accentInk }]}>
                    {t('gastos:categoriesScreen.selectedLabel')}
                  </Text>
                  <Text style={[styles.selectionValue, { color: neo.text }]}>
                    {managedCategory?.displayName ?? t('gastos:categoriesScreen.pickToManage')}
                  </Text>
                  <Text style={[styles.selectionMeta, { color: neo.textMuted }]}>
                    {managedCategory
                      ? `${t('gastos:categoriesScreen.associatedExpenses', { count: selectedCount })}${selectedCategoryId === managedCategory.id ? t('gastos:categoriesScreen.usedInFilterSuffix') : ''}`
                      : t('gastos:categoriesScreen.tapRowHint')}
                  </Text>
                  {managedCategory && selectedCount > 0 ? (
                    <Text style={[styles.selectionWarning, { color: warnInk }]}>
                      {t('gastos:categoriesScreen.cannotDeleteWarning')}
                    </Text>
                  ) : null}
                </NeoSurface>

                {categories.length === 0 ? (
                  <NeoStateBlock
                    description={t('states:empty.categories.description')}
                    icon="category"
                    title={t('states:empty.categories.title')}
                  />
                ) : (
                  <View style={styles.categoryList}>
                    {categories.map((category) => {
                      const isManaged = managedCategory?.id === category.id
                      const pastel = categoryPastel(category.name)
                      return (
                        <Pressable
                          accessibilityLabel={t('gastos:categoriesScreen.manageCategoryA11y', { name: category.displayName })}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isManaged }}
                          key={category.id}
                          onPress={() => {
                            void triggerHaptic('selection')
                            setCategoryManagementSelection(category.id)
                          }}
                          // El `Pressable` queda por FUERA de la superficie a
                          // propósito: la opacidad de press tiene que atenuar
                          // también el relieve, y un `opacity` en el hijo
                          // dejaría el fondo y la sombra a pleno.
                          style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
                        >
                          <NeoSurface
                            // En neo la selección NO es un borde de acento:
                            // es relieve — pozo + anillo verde 2.5px sobre el
                            // tinte del sistema, contra el tile extruido de
                            // las no seleccionadas.
                            backgroundColor={isManaged ? neo.selectedTint : undefined}
                            radius={neoRadii.tile}
                            style={[
                              styles.categoryItem,
                              SUPPORTS_INSET_SHADOW
                                ? null
                                : {
                                    borderWidth: 1.5,
                                    borderColor: isManaged ? neo.green : neo.sheetDivider,
                                  },
                            ]}
                            variant={isManaged ? 'ringSelected' : 'raisedMd'}
                          >
                            <View
                              style={[
                                styles.categoryDot,
                                { backgroundColor: isDark ? pastelDarkSolid(pastel) : pastel },
                              ]}
                            />
                            <View style={styles.categoryCopy}>
                              <Text style={[styles.categoryName, { color: neo.text }]}>
                                {category.displayName}
                              </Text>
                              <Text style={[styles.categoryMeta, { color: neo.textMuted }]}>
                                {t('gastos:categoriesScreen.categoryMeta', {
                                  count: categoryExpenseCountById.get(category.id) ?? 0,
                                  date: new Date(category.created_at).toLocaleDateString(getIntlLocale()),
                                })}
                              </Text>
                            </View>
                            {selectedCategoryId === category.id ? (
                              <Text style={[styles.categoryBadge, { color: accentInk }]}>
                                {t('gastos:categoriesScreen.filterBadge')}
                              </Text>
                            ) : null}
                          </NeoSurface>
                        </Pressable>
                      )
                    })}
                  </View>
                )}
              </NeoSurface>

              <View style={styles.actions}>
                <NeoButton
                  block
                  busy={createCategoryMutation.isPending}
                  label={t('gastos:categoriesScreen.newCategory')}
                  onPress={() => {
                    setEditingCategory(null)
                    setCategoryEditorMode('create')
                  }}
                  variant="primary"
                />
                <NeoButton
                  block
                  busy={renameCategoryMutation.isPending}
                  disabled={!canRenameManagedCategory}
                  label={t('gastos:categoriesScreen.renameSelected')}
                  onPress={() => {
                    if (!managedCategory || !canRenameManagedCategory) {
                      return
                    }

                    setEditingCategory(managedCategory)
                    setCategoryEditorMode('rename')
                  }}
                  variant="ghost"
                />
                <NeoButton
                  block
                  busy={deleteCategoryMutation.isPending}
                  disabled={!canDeleteManagedCategory}
                  label={t('gastos:categoriesScreen.deleteSelected')}
                  onPress={() => {
                    if (!managedCategory || !canDeleteManagedCategory) {
                      return
                    }

                    void (async () => {
                      // Reemplazo del `Alert.alert` de dos botones: misma
                      // salida segura (cancelar / scrim / back de Android
                      // resuelven `false`).
                      const confirmed = await neoConfirm(
                        t('gastos:categoriesScreen.deleteAlertTitle'),
                        {
                          message: t('gastos:categoriesScreen.deleteAlertMessage', {
                            name: managedCategory.name,
                          }),
                          confirmLabel: t('gastos:history.deleteConfirm'),
                          tone: 'destructive',
                        },
                      )
                      if (!confirmed) return

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
                    })()
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

// El `fontFamily` viaja SIEMPRE con el peso: cada peso de Nunito es un face
// estático propio, así que un `fontWeight` suelto no cambia la face.
const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  sectionStack: {
    gap: 18,
  },
  // Radio y relieve los pone `NeoSurface`; acá queda sólo la caja.
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
    fontFamily: nunitoFamily('800'),
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.3,
  },
  selectionSummary: {
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  selectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  selectionValue: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.3,
  },
  selectionMeta: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 18,
  },
  selectionWarning: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  categoryList: {
    gap: 14,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  categoryCopy: {
    flex: 1,
    gap: 2,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  categoryMeta: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  categoryBadge: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  actions: {
    gap: 12,
  },
})
