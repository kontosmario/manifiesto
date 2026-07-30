// Step 1 del wizard add-fijo: nombre + monto + atajos + categoría +
// frecuencia (con tile picker + cuotas card cuando aplica). Extraído
// de `add-fijo-v2-screen.tsx`. La screen pasa todo el form state desde
// `useAddFijoForm`.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { AmountCard } from '@/components/home/amount-card'
import { CategoryHorizontalRail } from '@/components/home/category-horizontal-rail'
import { SuggestedAmountStrip } from '@/components/home/suggested-amount-strip'
import {
  CUOTA_OPTIONS,
  FREQ_OPTIONS,
  QUICK_AMOUNTS,
  type FreqChoice,
} from '@/features/fixed-expenses/add-fijo-helpers'
import type { Category as FixedExpenseCategory } from '@/features/categories/use-categories'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { Field } from './field'
import { FreqTile } from './freq-tile'
import { NameInput } from './name-input'

export interface Step1FormProps {
  // Form state
  name: string
  onChangeName: (v: string) => void
  isNameFocused: boolean
  onNameFocus: () => void
  onNameBlur: () => void
  amount: number
  onPressAmount: () => void
  isNumpadVisible: boolean
  onAddQuickAmount: (delta: number) => void
  onClearAmount: () => void
  categories: FixedExpenseCategory[]
  categoryId: string | null
  onSelectCategory: (id: string) => void
  fijosTileWidth: number
  fijosTileHeight: number
  freqChoice: FreqChoice | null
  onSelectFreq: (id: FreqChoice) => void
  cuotaTot: number
  onSelectCuotaTot: (n: number) => void
  isInstallment: boolean
  totalCuotas: number
  // Missing-fields flags
  flagName: boolean
  flagAmount: boolean
  flagCategory: boolean
  flagFrequency: boolean
}

export function Step1Form(props: Step1FormProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const {
    name,
    onChangeName,
    isNameFocused,
    onNameFocus,
    onNameBlur,
    amount,
    onPressAmount,
    isNumpadVisible,
    onAddQuickAmount,
    onClearAmount,
    categories,
    categoryId,
    onSelectCategory,
    fijosTileWidth,
    fijosTileHeight,
    freqChoice,
    onSelectFreq,
    cuotaTot,
    onSelectCuotaTot,
    isInstallment,
    totalCuotas,
    flagName,
    flagAmount,
    flagCategory,
    flagFrequency,
  } = props

  return (
    <Animated.View
      key="step-1"
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(140)}
      layout={LinearTransition.duration(260)}
      style={styles.formStack}
    >
      <Field
        label={t('fijos:wizard.step1.nameLabel')}
        trailing={name.trim().length > 0 ? t('fijos:wizard.step1.nameEditHint') : undefined}
      >
        <NameInput
          value={name}
          onChange={onChangeName}
          isFocused={isNameFocused}
          onFocus={onNameFocus}
          onBlur={onNameBlur}
          warning={flagName}
        />
      </Field>

      <AmountCard
        amount={amount}
        isActive={isNumpadVisible}
        onPress={onPressAmount}
        warning={flagAmount}
      />

      {isInstallment && amount > 0 ? (
        <Text style={[styles.cuotaInlineHint, { color: theme.colors.textMuted }]}>
          {t('fijos:wizard.step1.installmentSummary', {
            count: cuotaTot,
            amount: formatMoney(amount),
            total: formatMoney(totalCuotas),
          })}
        </Text>
      ) : null}

      <SuggestedAmountStrip
        amounts={[...QUICK_AMOUNTS]}
        currentAmount={amount}
        onAdd={onAddQuickAmount}
        onClear={onClearAmount}
      />

      <CategoryHorizontalRail
        categories={categories}
        // El handoff muestra la píldora sólo cuando la categoría se dedujo
        // del nombre; acá se muestra cuando hay nombre escrito y todavía no
        // se eligió a mano, que es el mismo momento.
        hint={
          name.trim().length > 0 && categoryId == null
            ? t('fijos:wizard.step1.categorySuggested')
            : undefined
        }
        selectedCategoryId={categoryId ?? ''}
        onSelect={onSelectCategory}
        rows={2}
        iconScope="fixed_expense"
        tileWidth={fijosTileWidth}
        tileHeight={fijosTileHeight}
        warning={flagCategory}
      />

      <Field label={t('fijos:wizard.step1.frequencyLabel')}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.freqRow}
          decelerationRate="fast"
          snapToInterval={72 + 8}
          snapToAlignment="start"
        >
          {FREQ_OPTIONS.map((f) => (
            <FreqTile
              key={f.id}
              icon={f.icon}
              label={t(f.labelKey)}
              selected={freqChoice === f.id}
              onPress={() => onSelectFreq(f.id)}
              warning={flagFrequency}
            />
          ))}
        </ScrollView>

        {isInstallment ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(140)}
            layout={LinearTransition.duration(240)}
            style={[
              styles.cuotaCard,
              {
                backgroundColor: theme.isDark
                  ? 'rgba(107,154,214,0.14)'
                  : '#DCE8F5',
                borderColor: theme.isDark ? '#2E4A6E' : '#A8BED4',
              },
            ]}
          >
            <Text style={[styles.cuotaEyebrow, { color: theme.colors.textMuted }]}>
              {t('fijos:wizard.step1.howManyInstallments')}
            </Text>
            <View style={styles.cuotaRow}>
              {CUOTA_OPTIONS.map((n) => {
                const on = cuotaTot === n
                return (
                  <Pressable
                    key={n}
                    onPress={() => onSelectCuotaTot(n)}
                    style={[
                      styles.cuotaPill,
                      {
                        backgroundColor: on ? theme.colors.primary : 'transparent',
                        borderColor: on ? theme.colors.primary : theme.colors.line,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t('fijos:wizard.step1.installmentsA11y', { count: n })}
                  >
                    <Text
                      style={[
                        styles.cuotaPillText,
                        { color: on ? theme.colors.textOnPrimary : theme.colors.text },
                      ]}
                    >
                      {n}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            {amount > 0 ? (
              <Text style={[styles.cuotaFootnote, { color: theme.colors.textMuted }]}>
                {t('fijos:wizard.step1.installmentSummary', {
                  count: cuotaTot,
                  amount: formatMoney(amount),
                  total: formatMoney(totalCuotas),
                })}
              </Text>
            ) : null}
          </Animated.View>
        ) : null}
      </Field>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  formStack: { gap: 12 },
  cuotaInlineHint: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: -4,
    paddingHorizontal: 4,
  },
  freqRow: {
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  cuotaCard: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  cuotaEyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  cuotaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  cuotaPill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  cuotaPillText: { fontSize: 12, fontWeight: '700' },
  cuotaFootnote: { fontSize: 11, marginTop: 8 },
})
