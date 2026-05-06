import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { FixedExpenseForm } from '@/components/fixed-expenses/fixed-expense-form'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingBlock } from '@/components/ui/loading-block'
import { Screen } from '@/components/ui/screen'
import { useAddFixedExpenseController } from '@/features/fixed-expenses/use-add-fixed-expense-controller'
import { fixedExpenseKindLabel } from '@/features/fixed-expenses/fixed-expense-types'
import { buildScreenHeaderPalette } from '@/theme/screen-header'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface AddFixedExpenseScreenProps {
  familyId: string
  initialSection?: string | null
}

export function AddFixedExpenseScreen({
  familyId,
  initialSection,
}: AddFixedExpenseScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const headerPalette = buildScreenHeaderPalette(theme)
  const controller = useAddFixedExpenseController({
    familyId,
    initialSection,
    onCreated: () => {
      router.replace('/(app)/(tabs)/fixed-expenses')
    },
  })
  const {
    categories,
    categoriesQuery,
    isAmountFocused,
    isBusy,
    isRemainingBalanceFocused,
    sectionConfig,
    submit,
    submitState,
    values,
    actions,
  } = controller

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === values.categoryId) ?? null,
    [categories, values.categoryId],
  )
  const categoriesLoadError = categoriesQuery.error
  const shouldShowErrorState = Boolean(categoriesLoadError && !categoriesQuery.data)

  return (
    <Screen
      canGoBack
      contentContainerStyle={styles.screenContent}
      subtitle="Define gastos fijos que impactan el ciclo: recurrentes, periódicos, cuotas o deuda."
      title={sectionConfig.addTitle}
      titleColor={headerPalette.titleColor}
    >
      <View style={styles.sectionStack}>
        {!theme.isDark ? <AmbientBackdrop variant="commitments" /> : null}

        {shouldShowErrorState ? (
          <ErrorState
            description={getErrorMessage(
              categoriesLoadError,
              'No pudimos cargar las categorías necesarias para crear el gasto fijo.',
            )}
            title="No pudimos abrir el formulario"
            onAction={() => {
              void categoriesQuery.refetch()
            }}
          />
        ) : (
          <BrandedPanel style={styles.formCard}>
            <View style={styles.sectionIntro}>
              <Text style={[styles.sectionEyebrow, { color: theme.colors.primaryStrong }]}>
                {sectionConfig.title}
              </Text>
              <Text style={[styles.sectionTitle, theme.typography.sectionTitle, { color: theme.colors.text }]}>
                Ordená la base estable del hogar
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
                <Text style={[styles.highlightLabel, { color: theme.colors.textMuted }]}>Tipo</Text>
                <Text style={[styles.highlightValue, { color: theme.colors.text }]}>
                  {fixedExpenseKindLabel(values.kind)}
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
                  {selectedCategory?.name ?? 'Elige una'}
                </Text>
              </View>
            </View>

            {categoriesQuery.isLoading ? (
              <LoadingBlock label="Cargando categorias..." />
            ) : categories.length === 0 ? (
              <EmptyState
                icon="category"
                subtitle="Necesitas al menos una categoría para registrar gastos fijos, cuotas o deuda."
                title="Primero crea una categoría"
              />
            ) : (
              <FixedExpenseForm
                canSubmit={submitState.canSubmit}
                categories={categories}
                isAmountFocused={isAmountFocused}
                isBusy={isBusy}
                isRemainingBalanceFocused={isRemainingBalanceFocused}
                onAmountFocusChange={actions.onAmountFocusChange}
                onFieldChange={actions.onFieldChange}
                onRemainingBalanceFocusChange={actions.onRemainingBalanceFocusChange}
                onSubmit={submit}
                submitLabel={sectionConfig.addSubmitLabel}
                values={values}
              />
            )}
          </BrandedPanel>
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
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
})
