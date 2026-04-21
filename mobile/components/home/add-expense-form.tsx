import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingBlock } from '@/components/ui/loading-block'
import { TextField } from '@/components/ui/text-field'
import { type Category } from '@/features/categories/use-categories'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter, formatPriceInputValue } from '@/utils/money'

interface AddExpenseFormProps {
  amount: number
  amountHelper?: string
  categories: Category[]
  description: string
  hasValidAmount: boolean
  isBusy: boolean
  isCategoriesLoading: boolean
  isPriceFocused: boolean
  normalizeSuggestionLabel: (value: string) => string
  price: string
  quickDescriptionSuggestions: string[]
  selectedCategoryId: string
  suggestedAmounts: number[]
  onDescriptionChange: (value: string) => void
  onPriceBlur: () => void
  onPriceChange: (value: string) => void
  onPriceFocus: () => void
  onSelectCategory: (categoryId: string) => void
  onSelectDescriptionSuggestion: (value: string) => void
  onSelectSuggestedAmount: (value: number) => void
  onSubmit: () => void
}

export function AddExpenseForm({
  amount,
  amountHelper,
  categories,
  description,
  hasValidAmount,
  isBusy,
  isCategoriesLoading,
  isPriceFocused,
  normalizeSuggestionLabel,
  onDescriptionChange,
  onPriceBlur,
  onPriceChange,
  onPriceFocus,
  onSelectCategory,
  onSelectDescriptionSuggestion,
  onSelectSuggestedAmount,
  onSubmit,
  price,
  quickDescriptionSuggestions,
  selectedCategoryId,
  suggestedAmounts,
}: AddExpenseFormProps) {
  const { theme } = useAppTheme()
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null

  return (
    <>
      <BrandedPanel style={styles.formCard}>
        <View style={styles.sectionIntro}>
          <Text style={[styles.sectionEyebrow, { color: theme.colors.primaryStrong }]}>Movimiento</Text>
          <Text style={[styles.sectionTitle, theme.typography.sectionTitle, { color: theme.colors.text }]}>Monto, categoría y listo</Text>
        </View>

        {isCategoriesLoading ? <LoadingBlock label="Cargando categorías..." /> : null}

        {!isCategoriesLoading && categories.length === 0 ? (
          <EmptyState
            icon="category"
            subtitle="Necesitás al menos una categoría para registrar movimientos."
            title="Primero creá una categoría"
          />
        ) : null}

        {categories.length > 0 ? (
          <>
            <TextField
              autoFocus
              helper={amountHelper}
              keyboardType="decimal-pad"
              label="Monto"
              onBlur={onPriceBlur}
              onChangeText={onPriceChange}
              onFocus={onPriceFocus}
              placeholder="$ 0"
              returnKeyType="done"
              value={formatPriceInputValue(price, isPriceFocused)}
            />

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
                <Text style={[styles.highlightLabel, { color: theme.colors.textMuted }]}>Categoría</Text>
                <Text style={[styles.highlightValue, { color: theme.colors.text }]}>
                  {selectedCategory?.name ?? 'Elegí una'}
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
                <Text style={[styles.highlightLabel, { color: theme.colors.textMuted }]}>Monto listo</Text>
                <Text style={[styles.highlightValue, { color: theme.colors.text }]}>
                  {hasValidAmount ? currencyFormatter.format(amount) : 'Pendiente'}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.fieldGroup,
                styles.fieldCard,
                {
                  backgroundColor: theme.colors.surfaceMuted,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Montos rápidos</Text>
              <ScrollView
                contentContainerStyle={styles.chipsRow}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {suggestedAmounts.map((suggestedAmount) => (
                  <Chip
                    isActive={hasValidAmount && Math.round(amount) === suggestedAmount}
                    key={suggestedAmount}
                    label={currencyFormatter.format(suggestedAmount)}
                    onPress={() => onSelectSuggestedAmount(suggestedAmount)}
                  />
                ))}
              </ScrollView>
            </View>

            <View
              style={[
                styles.fieldGroup,
                styles.fieldCard,
                {
                  backgroundColor: theme.colors.surfaceMuted,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Categoría</Text>
              <ScrollView
                contentContainerStyle={styles.chipsRow}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {categories.map((category) => (
                  <Chip
                    color={category.color}
                    isActive={selectedCategoryId === category.id}
                    key={category.id}
                    label={category.name}
                    onPress={() => onSelectCategory(category.id)}
                  />
                ))}
              </ScrollView>
            </View>

            {quickDescriptionSuggestions.length > 0 ? (
              <View
                style={[
                  styles.fieldGroup,
                  styles.fieldCard,
                  {
                    backgroundColor: theme.colors.surfaceMuted,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>
                  Descripciones rápidas
                </Text>
                <ScrollView
                  contentContainerStyle={styles.chipsRow}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {quickDescriptionSuggestions.map((suggestion) => (
                    <Chip
                      isActive={
                        normalizeSuggestionLabel(description) === normalizeSuggestionLabel(suggestion)
                      }
                      key={suggestion}
                      label={suggestion}
                      onPress={() => onSelectDescriptionSuggestion(suggestion)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <TextField
              autoCapitalize="sentences"
              autoCorrect={false}
              helper="Si ninguna sugerencia encaja, escribila."
              label="Descripción"
              maxLength={60}
              onChangeText={onDescriptionChange}
              placeholder="Ej: Supermercado"
              returnKeyType="done"
              value={description}
            />
          </>
        ) : null}
      </BrandedPanel>

      <View style={styles.actions}>
        <AppButton
          disabled={!selectedCategoryId || !description.trim() || !hasValidAmount}
          label="Guardar gasto"
          loading={isBusy}
          onPress={onSubmit}
        />
      </View>
    </>
  )
}

const styles = StyleSheet.create({
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
  fieldGroup: {
    gap: 10,
  },
  fieldCard: {
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
  chipsRow: {
    gap: 12,
  },
  actions: {
    gap: 12,
  },
})
