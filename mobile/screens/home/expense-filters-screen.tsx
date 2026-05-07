import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AppButton } from '@/components/ui/button'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingBlock } from '@/components/ui/loading-block'
import { Screen } from '@/components/ui/screen'
import { TextField } from '@/components/ui/text-field'
import { type Category, useCategories } from '@/features/categories/use-categories'
import {
  ALL_CATEGORIES_KEY,
  PERIOD_OPTIONS,
  resolveSelectedCategoryId,
  type PeriodFilter,
} from '@/features/expenses/expense-history'
import { useExpenseHistoryFilters } from '@/features/expenses/expense-history-filters.store'
import { buildScreenHeaderPalette } from '@/theme/screen-header'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface ExpenseFiltersScreenProps {
  familyId: string
}

function buildCategoryLabel(
  categories: Category[],
  categorySelection: string,
) {
  const selectedCategoryId = resolveSelectedCategoryId(categories, categorySelection)

  if (!selectedCategoryId) {
    return 'Todas'
  }

  return categories.find((category) => category.id === selectedCategoryId)?.name ?? 'Todas'
}

export function ExpenseFiltersScreen({ familyId }: ExpenseFiltersScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const headerPalette = buildScreenHeaderPalette(theme)
  const categoriesQuery = useCategories(familyId)
  const categoriesData = categoriesQuery.data
  const categories = useMemo(() => categoriesData ?? [], [categoriesData])
  const filters = useExpenseHistoryFilters(familyId)
  const [categorySelectionDraft, setCategorySelectionDraft] = useState(filters.categorySelection)
  const [periodFilterDraft, setPeriodFilterDraft] = useState<PeriodFilter>(filters.periodFilter)
  const [searchQueryDraft, setSearchQueryDraft] = useState(filters.searchQuery)

  const selectedCategoryLabel = useMemo(
    () => buildCategoryLabel(categories, categorySelectionDraft),
    [categories, categorySelectionDraft],
  )
  const isDirty =
    categorySelectionDraft !== filters.categorySelection ||
    periodFilterDraft !== filters.periodFilter ||
    searchQueryDraft !== filters.searchQuery

  return (
    <Screen
      canGoBack
      contentContainerStyle={styles.screenContent}
      subtitle="Ajusta período, categoría y búsqueda con el mismo patrón modal de Agregar gasto."
      title="Filtros"
      titleColor={headerPalette.titleColor}
    >
      <View style={styles.sectionStack}>
        {!theme.isDark ? <AmbientBackdrop variant="form" /> : null}

        <BrandedPanel style={styles.formCard}>
          <View style={styles.sectionIntro}>
            <Text style={[styles.sectionEyebrow, { color: theme.colors.primaryStrong }]}>
              Historial
            </Text>
            <Text style={[styles.sectionTitle, theme.typography.sectionTitle, { color: theme.colors.text }]}>
              Define qué quieres mirar
            </Text>
          </View>

          <View style={styles.highlightRow}>
            <View
              style={[
                styles.highlightCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.highlightLabel, { color: theme.colors.textMuted }]}>Periodo</Text>
              <Text style={[styles.highlightValue, { color: theme.colors.text }]}>
                {PERIOD_OPTIONS.find((option) => option.key === periodFilterDraft)?.label ?? 'Ciclo'}
              </Text>
            </View>
            <View
              style={[
                styles.highlightCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.highlightLabel, { color: theme.colors.textMuted }]}>Categoria</Text>
              <Text style={[styles.highlightValue, { color: theme.colors.text }]}>
                {selectedCategoryLabel}
              </Text>
            </View>
          </View>

          {categoriesQuery.isLoading ? <LoadingBlock label="Cargando categorias..." /> : null}

          {!categoriesQuery.isLoading && categories.length === 0 ? (
            <EmptyState
              icon="category"
              subtitle="Todavia no hay categorias. Igual puedes aplicar período y búsqueda libre."
              title="Sin categorias"
            />
          ) : null}

          <View
            style={[
              styles.fieldCard,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Periodo</Text>
            <ScrollView
              contentContainerStyle={styles.chipsRow}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {PERIOD_OPTIONS.map((option) => (
                <Chip
                  key={option.key}
                  label={option.label}
                  onPress={() => setPeriodFilterDraft(option.key)}
                  isActive={periodFilterDraft === option.key}
                />
              ))}
            </ScrollView>
          </View>

          <View
            style={[
              styles.fieldCard,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Categoria</Text>
            <ScrollView
              contentContainerStyle={styles.chipsRow}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              <Chip
                label="Todas"
                onPress={() => setCategorySelectionDraft(ALL_CATEGORIES_KEY)}
                isActive={resolveSelectedCategoryId(categories, categorySelectionDraft) === ''}
              />
              {categories.map((category) => (
                <Chip
                  color={category.color}
                  key={category.id}
                  label={category.name}
                  onPress={() => setCategorySelectionDraft(category.id)}
                  isActive={resolveSelectedCategoryId(categories, categorySelectionDraft) === category.id}
                />
              ))}
            </ScrollView>
          </View>

          <TextField
            autoCapitalize="none"
            autoCorrect={false}
            helper="Descripción, categoría o persona."
            label="Buscar"
            onChangeText={setSearchQueryDraft}
            placeholder="Ej: supermercado, nafta, Agus"
            returnKeyType="search"
            value={searchQueryDraft}
          />
        </BrandedPanel>

        <View style={styles.actions}>
          <AppButton
            disabled={!isDirty}
            label="Aplicar filtros"
            onPress={() => {
              filters.setCategorySelection(
                resolveSelectedCategoryId(categories, categorySelectionDraft) || ALL_CATEGORIES_KEY,
              )
              filters.setPeriodFilter(periodFilterDraft)
              filters.setSearchQuery(searchQueryDraft)
              router.back()
            }}
          />
          <AppButton
            label="Limpiar filtros"
            onPress={() => {
              setCategorySelectionDraft(ALL_CATEGORIES_KEY)
              setPeriodFilterDraft('cycle')
              setSearchQueryDraft('')
            }}
            variant="ghost"
          />
        </View>
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
  highlightRow: {
    flexDirection: 'row',
    gap: 12,
  },
  highlightCard: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  highlightLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  highlightValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  fieldCard: {
    gap: 10,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chipsRow: {
    gap: 12,
  },
  actions: {
    gap: 12,
  },
})
