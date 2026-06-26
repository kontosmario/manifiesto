import { useRef, useState } from 'react'
import { Keyboard, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { AddExpenseAdvisorBanner } from '@/components/home/add-expense-advisor-banner'
import { AmountCard } from '@/components/home/amount-card'
import { CategoryHorizontalRail } from '@/components/home/category-horizontal-rail'
import { DescriptionRow } from '@/components/home/description-row'
import { NotesRow } from '@/components/home/notes-row'
import { SuggestedAmountStrip } from '@/components/home/suggested-amount-strip'
import { RiseView } from '@/components/home/animated/rise-view'
import { AppButton } from '@/components/ui/button'
import { InAppNumpad } from '@/components/ui/in-app-numpad'
import type { Category } from '@/features/categories/use-categories'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import { formatMissingFields } from '@/lib/form-missing-fields'
import i18n from '@/lib/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface AddExpenseDashboardProps {
  amount: number
  rawPrice: string
  rankedCategories: Category[]
  selectedCategoryId: string
  suggestedAmounts: number[]
  quickDescriptionSuggestions: string[]
  description: string
  notes: string
  isBusy: boolean
  submitErrorMessage?: string | null
  /** When set, the new movement is back-dated to this day — hint
   *  the user via a pill so they know they're not adding to "today". */
  forDate?: Date | null
  /** Optional advisor signals to surface a contextual banner above
   *  the category rail (cap-breach, cat-accel, recovery-path). */
  advisorSignals?: ControlAdvisorTask[]
  /** Human-readable list of required fields the user hasn't filled. */
  missingFields: readonly string[]
  /** Bumped by the controller every time the user taps Guardar with
   *  required fields missing. The dashboard reads its initial value at
   *  mount and flips into "flagged" mode once `highlightToken` moves —
   *  paints `warning` on the specific unfilled inputs. */
  highlightToken: number
  /** Called by the dashboard when the CTA is tapped while
   *  `missingFields.length > 0`. Controller bumps `highlightToken`. */
  onFlagMissingFields: () => void
  onRawPriceChange: (value: string) => void
  onAddQuickAmount: (delta: number) => void
  onClearAmount: () => void
  onSelectCategory: (categoryId: string) => void
  onSelectDescriptionSuggestion: (value: string) => void
  onDescriptionChange: (value: string) => void
  onNotesChange: (value: string) => void
  onSubmit: () => void
}

export function AddExpenseDashboard({
  amount,
  rawPrice,
  rankedCategories,
  selectedCategoryId,
  suggestedAmounts,
  quickDescriptionSuggestions,
  description,
  notes,
  isBusy,
  submitErrorMessage,
  forDate,
  advisorSignals,
  missingFields,
  highlightToken,
  onFlagMissingFields,
  onRawPriceChange,
  onAddQuickAmount,
  onClearAmount,
  onSelectCategory,
  onSelectDescriptionSuggestion,
  onDescriptionChange,
  onNotesChange,
  onSubmit,
}: AddExpenseDashboardProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const [numpadVisible, setNumpadVisible] = useState(false)

  // Flagged once the user nudges Guardar with required fields empty.
  // Stays true for the life of the screen so the warning marks persist
  // and clear field-by-field as the user completes each input.
  const initialTokenRef = useRef(highlightToken)
  const isFlagged = highlightToken > initialTokenRef.current
  const flagAmount = isFlagged && missingFields.includes('monto')
  const flagDescription = isFlagged && missingFields.includes('descripción')
  const flagCategory = isFlagged && missingFields.includes('categoría')

  const canSubmit = missingFields.length === 0

  const showMissingHelper = !canSubmit && missingFields.length > 0

  const handlePrimaryPress = () => {
    if (!canSubmit) {
      void triggerHaptic('warning')
      onFlagMissingFields()
      return
    }
    onSubmit()
  }

  // Any tap on a non-description control should release the
  // description input's focus and close the keyboard. Same pattern
  // we use in AddFijo so the form feels coherent across both flows.
  const handleOpenNumpad = () => {
    Keyboard.dismiss()
    setNumpadVisible(true)
  }
  const handleAddQuickAmount = (delta: number) => {
    Keyboard.dismiss()
    onAddQuickAmount(delta)
  }
  const handleClearAmount = () => {
    Keyboard.dismiss()
    onClearAmount()
  }
  const handleSelectCategory = (categoryId: string) => {
    Keyboard.dismiss()
    onSelectCategory(categoryId)
  }
  // Picking a quick description suggestion also closes the keyboard:
  // the user clearly committed to that label, no point in keeping the
  // input focused. Mirrors the AddFijo "tap-to-commit" pattern.
  const handleSelectDescriptionSuggestion = (value: string) => {
    Keyboard.dismiss()
    onSelectDescriptionSuggestion(value)
  }

  return (
    <View style={styles.stack}>
      {forDate ? (
        <RiseView>
          <View
            style={[
              styles.forDatePill,
              {
                backgroundColor: theme.colors.creamSoft,
                borderColor: theme.colors.line,
              },
            ]}
          >
            <Text style={[styles.forDatePillLabel, { color: theme.colors.textMuted }]}>
              {t('home:addExpenseDashboard.loggingFor')}
            </Text>
            <Text style={[styles.forDatePillValue, { color: theme.colors.text }]}>
              {formatForDateLabel(forDate)}
            </Text>
          </View>
        </RiseView>
      ) : null}

      <RiseView delay={forDate ? 60 : 0}>
        <AmountCard
          amount={amount}
          isActive={numpadVisible}
          onPress={handleOpenNumpad}
          warning={flagAmount}
        />
      </RiseView>

      <RiseView delay={forDate ? 120 : 60}>
        <SuggestedAmountStrip
          amounts={suggestedAmounts}
          currentAmount={amount}
          onAdd={handleAddQuickAmount}
          onClear={handleClearAmount}
        />
      </RiseView>

      <RiseView delay={forDate ? 180 : 120}>
        <CategoryHorizontalRail
          categories={rankedCategories}
          selectedCategoryId={selectedCategoryId}
          onSelect={handleSelectCategory}
          staticGrid
          warning={flagCategory}
        />
      </RiseView>

      {advisorSignals && advisorSignals.length > 0 ? (
        <AddExpenseAdvisorBanner
          signals={advisorSignals}
          selectedCategoryId={selectedCategoryId}
          categoryNameById={
            new Map(rankedCategories.map((c) => [c.id, c.name]))
          }
        />
      ) : null}

      <RiseView delay={forDate ? 240 : 180}>
        <DescriptionRow
          description={description}
          onChange={onDescriptionChange}
          quickSuggestions={quickDescriptionSuggestions}
          onSelectSuggestion={handleSelectDescriptionSuggestion}
          warning={flagDescription}
        />
      </RiseView>

      <RiseView delay={forDate ? 260 : 200}>
        <NotesRow notes={notes} onChange={onNotesChange} />
      </RiseView>

      {submitErrorMessage ? (
        <Text style={[typography.caption, styles.error, { color: theme.colors.danger }]}>
          {submitErrorMessage}
        </Text>
      ) : null}

      <RiseView delay={forDate ? 300 : 240}>
        <View style={[styles.footer, { borderTopColor: theme.colors.line }]}>
          {/* `disabled={false}` keeps the press reachable so a tap on the
              dim button routes through `handlePrimaryPress` which bumps
              `highlightToken` and paints the missing inputs with their
              `warning` glide. `lookDisabled` styling lives in the button
              opacity via `loading`'s sibling state — we instead lean on
              the AppButton's own disabled affordance with the in-flight
              flag (`loading`) being the only hard-block. */}
          <AppButton
            label={t('home:addExpenseDashboard.saveExpense')}
            variant="primary"
            loading={isBusy}
            disabled={false}
            lookDisabled={!canSubmit}
            onPress={handlePrimaryPress}
          />
          {showMissingHelper ? (
            <View style={styles.helperRow}>
              <MaterialIcons
                name="error-outline"
                size={14}
                color={theme.colors.warning}
              />
              <Text
                style={[styles.helperText, { color: theme.colors.warning }]}
                numberOfLines={2}
              >
                {formatMissingFields(missingFields)}
              </Text>
            </View>
          ) : null}
        </View>
      </RiseView>

      <InAppNumpad
        visible={numpadVisible}
        rawValue={rawPrice}
        onChangeRawValue={onRawPriceChange}
        onDismiss={() => setNumpadVisible(false)}
      />
    </View>
  )
}

const WEEKDAY_LABELS = [
  'domingo', 'lunes', 'martes', 'miércoles',
  'jueves', 'viernes', 'sábado',
]
const MONTH_LABELS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

function formatForDateLabel(date: Date): string {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round(
    (now.getTime() - target.getTime()) / (1000 * 60 * 60 * 24),
  )
  if (diffDays === 0) return i18n.t('home:addExpenseDashboard.today')
  if (diffDays === 1) return i18n.t('home:addExpenseDashboard.yesterday')
  const weekday = WEEKDAY_LABELS[date.getDay()]
  const month = MONTH_LABELS[date.getMonth()]
  return `${weekday} ${date.getDate()} ${month}`
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  forDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  forDatePillLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  forDatePillValue: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
    textTransform: 'capitalize',
  },
  error: {
    paddingHorizontal: 4,
  },
  footer: {
    paddingTop: 8,
    gap: 8,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  helperText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
    textAlign: 'center',
    flexShrink: 1,
  },
})
