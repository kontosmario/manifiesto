import { useMemo, useRef, useState } from 'react'
import { Alert, Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'
import { AmountCard } from '@/components/home/amount-card'
import { SuggestedAmountStrip } from '@/components/home/suggested-amount-strip'
import { DescriptionRow } from '@/components/home/description-row'
import { RiseView } from '@/components/home/animated/rise-view'
import { AppButton } from '@/components/ui/button'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { Chip } from '@/components/ui/chip'
import { InAppNumpad } from '@/components/ui/in-app-numpad'
import { Screen } from '@/components/ui/screen'
import {
  useCreateIncomeEvent,
  type IncomeEventKind,
} from '@/features/income/use-income-events'
import { formatMissingFields } from '@/lib/form-missing-fields'
import { triggerHaptic } from '@/lib/haptics'
import { buildScreenHeaderPalette } from '@/theme/screen-header'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'
import { parsePrice, serializePrice } from '@/utils/money'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import { getErrorMessage } from '@/utils/error-message'

interface AddIncomeScreenProps {
  familyId: string
  userId: string
}

interface KindMeta {
  key: IncomeEventKind
  labelKey: string
  // Key into CATEGORY_ICONS (sticker PNG registry).
  icon: string
}

// Four constrained kinds — keeps server-side analytics tractable
// while covering the realistic mental model. Open-text `description`
// captures the rest. Icons are sticker PNGs from the category
// registry (matching the add-expense / fijos look).
const KINDS: KindMeta[] = [
  { key: 'transfer', labelKey: 'gastos:import.incomeKind.transfer',  icon: 'finanzas/transferencia' },
  { key: 'bonus',    labelKey: 'gastos:import.incomeKind.bonus',     icon: 'finanzas/bonus' },
  { key: 'gift',     labelKey: 'gastos:import.incomeKind.gift',      icon: 'servicios-general/regalos' },
  { key: 'other',    labelKey: 'gastos:import.incomeKind.other',     icon: 'finanzas/billetera' },
]

const SUGGESTED_DELTAS = [5000, 15000, 30000, 50000, 100000]

const QUICK_DESCRIPTION_KEYS = [
  'gastos:addIncome.quickDescriptions.transfer',
  'gastos:addIncome.quickDescriptions.bonus13th',
  'gastos:addIncome.quickDescriptions.workBonus',
  'gastos:addIncome.quickDescriptions.birthdayGift',
  'gastos:addIncome.quickDescriptions.freelance',
  'gastos:addIncome.quickDescriptions.refund',
]

/**
 * "Agregar ingreso" — visually mirrors `AddExpenseDashboard`. Same
 * stack: AmountCard (opens InAppNumpad) → SuggestedAmountStrip →
 * kind picker (4 tiles, same shape as category tiles) → description
 * row → optional date chips → submit footer.
 *
 * Persists to `public.income_events`; the cycle's `availableToday`
 * picks it up via `useCycleIncomeEventsTotal` in `useHomeMetrics`.
 */
export function AddIncomeScreen({ familyId }: AddIncomeScreenProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const headerPalette = buildScreenHeaderPalette(theme)
  const quickDescriptions = useMemo(
    () => QUICK_DESCRIPTION_KEYS.map((key) => t(key)),
    [t],
  )

  const [rawAmount, setRawAmount] = useState('')
  // No pre-selected kind. The user must explicitly pick transfer /
  // bonus / gift / other — same data-integrity stance the
  // import-review wizard takes for category. Null until chosen.
  const [kind, setKind] = useState<IncomeEventKind | null>(null)
  const [description, setDescription] = useState('')
  const [dayOffset, setDayOffset] = useState<0 | 1 | 2>(0)
  const [numpadVisible, setNumpadVisible] = useState(false)
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null)
  // Bumped each time the user taps Guardar while required fields are
  // missing. Captured at mount via `initialTokenRef`; once it moves,
  // the screen flips into "flagged" mode and paints warning hues on
  // the unfilled inputs.
  const [highlightToken, setHighlightToken] = useState(0)
  const initialTokenRef = useRef(highlightToken)
  const isFlagged = highlightToken > initialTokenRef.current

  const createMutation = useCreateIncomeEvent()
  const parsedAmount = useMemo(() => parsePrice(rawAmount), [rawAmount])
  const hasValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0
  // AmountCard renders the number directly; an empty rawAmount makes
  // parsePrice() return NaN which would show as "NaN" in the card.
  // Mirror the add-expense controller and clamp to 0 when invalid.
  const displayAmount = hasValidAmount ? parsedAmount : 0

  const missingFields = useMemo<string[]>(() => {
    const missing: string[] = []
    if (!hasValidAmount) missing.push(t('gastos:import.field.amount'))
    if (description.trim().length === 0) missing.push(t('gastos:import.field.description'))
    if (!kind) missing.push(t('gastos:addIncome.field.incomeType'))
    return missing
  }, [hasValidAmount, description, kind, t])
  const canSubmit = missingFields.length === 0
  const flagAmount = isFlagged && missingFields.includes(t('gastos:import.field.amount'))
  const flagDescription = isFlagged && missingFields.includes(t('gastos:import.field.description'))
  const flagKind = isFlagged && missingFields.includes(t('gastos:addIncome.field.incomeType'))

  const eventDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - dayOffset)
    return d
  }, [dayOffset])

  // Same pattern as AddExpenseDashboard: any tap on a non-text
  // control closes the keyboard so the form feels coherent.
  const handleOpenNumpad = () => {
    Keyboard.dismiss()
    setNumpadVisible(true)
  }
  const handleAddQuickAmount = (delta: number) => {
    Keyboard.dismiss()
    void triggerHaptic('selection')
    setRawAmount(serializePrice(displayAmount + delta))
  }
  const handleClearAmount = () => {
    Keyboard.dismiss()
    setRawAmount('')
  }
  const handleSelectKind = (next: IncomeEventKind) => {
    Keyboard.dismiss()
    void triggerHaptic('selection')
    setKind(next)
  }
  const handleSelectDescriptionSuggestion = (value: string) => {
    Keyboard.dismiss()
    void triggerHaptic('selection')
    setDescription(value)
  }
  const handleSelectDayOffset = (offset: 0 | 1 | 2) => {
    Keyboard.dismiss()
    void triggerHaptic('selection')
    setDayOffset(offset)
  }

  const handlePrimaryPress = () => {
    if (!canSubmit) {
      void triggerHaptic('warning')
      setHighlightToken((prev) => prev + 1)
      return
    }
    handleSubmit()
  }

  const handleSubmit = () => {
    if (!canSubmit || !kind) return
    Keyboard.dismiss()
    setSubmitErrorMessage(null)
    void triggerHaptic('medium')
    createMutation.mutate(
      {
        familyId,
        amount: parsedAmount,
        kind,
        description,
        eventDate: formatLocalDateKey(eventDate),
      },
      {
        onSuccess: () => {
          void triggerHaptic('success')
          router.back()
        },
        onError: (err: unknown) => {
          void triggerHaptic('error')
          const msg = getErrorMessage(err, t('gastos:addIncome.retryLater'))
          setSubmitErrorMessage(msg)
          Alert.alert(t('gastos:addIncome.saveErrorTitle'), msg)
        },
      },
    )
  }

  return (
    <Screen
      canGoBack
      showGrabHandle
      contentContainerStyle={styles.screenContent}
      title={t('gastos:addIncome.title')}
      titleColor={headerPalette.titleColor}
    >
      {!theme.isDark ? <AmbientBackdrop variant="form" /> : null}

      <View style={styles.stack}>
        {/* Date pill — only when backdating (mirrors the forDate pill
            on AddExpenseDashboard). Today is the default, no pill. */}
        {dayOffset !== 0 ? (
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
                {t('gastos:addIncome.registeringFor')}
              </Text>
              <Text style={[styles.forDatePillValue, { color: theme.colors.text }]}>
                {dayOffset === 1 ? t('gastos:addIncome.yesterdayLower') : t('gastos:addIncome.dayBeforeLower')}
              </Text>
            </View>
          </RiseView>
        ) : null}

        <RiseView delay={dayOffset !== 0 ? 60 : 0}>
          <AmountCard
            amount={displayAmount}
            isActive={numpadVisible}
            onPress={handleOpenNumpad}
            label={t('gastos:import.row.incomeAmount')}
            warning={flagAmount}
          />
        </RiseView>

        <RiseView delay={dayOffset !== 0 ? 120 : 60}>
          <SuggestedAmountStrip
            amounts={SUGGESTED_DELTAS}
            currentAmount={parsedAmount}
            onAdd={handleAddQuickAmount}
            onClear={handleClearAmount}
          />
        </RiseView>

        {/* Kind picker — 2×2 grid mirroring the category tile look:
            rounded 14, creamCard bg idle, primary surface + border
            when selected, icon centered with label below. */}
        <RiseView delay={dayOffset !== 0 ? 180 : 120}>
          <View>
            <Text
              style={[
                styles.sectionLabel,
                {
                  color: flagKind
                    ? theme.colors.warning
                    : theme.colors.textMuted,
                },
              ]}
            >
              {flagKind ? t('gastos:addIncome.fromWhereFlagged') : t('gastos:addIncome.fromWhere')}
            </Text>
            <View style={styles.kindGrid}>
              {KINDS.map((k) => {
                const selected = kind === k.key
                return (
                  <Pressable
                    key={k.key}
                    onPress={() => handleSelectKind(k.key)}
                    style={({ pressed }) => [
                      styles.kindTile,
                      {
                        backgroundColor: selected
                          ? theme.colors.primarySurface
                          : theme.colors.creamCard,
                        // Unselected tiles tint to warning when the
                        // user has flagged this section as missing.
                        // Selected tiles keep brand color so the
                        // recovery state is unambiguous.
                        borderColor: selected
                          ? theme.colors.primary
                          : flagKind
                            ? theme.colors.warning
                            : theme.colors.line,
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t(k.labelKey)}
                  >
                    <View
                      style={[
                        styles.kindIconBadge,
                        {
                          backgroundColor: selected
                            ? theme.colors.primary
                            : theme.colors.creamSoft,
                        },
                      ]}
                    >
                      {CATEGORY_ICONS[k.icon] ? (
                        <Image
                          source={CATEGORY_ICONS[k.icon]}
                          style={styles.kindIconImage}
                          resizeMode="contain"
                        />
                      ) : (
                        <MaterialIcons
                          name="attach-money"
                          size={20}
                          color={
                            selected
                              ? theme.isDark
                                ? '#12211A'
                                : '#FFFFFF'
                              : theme.colors.textMuted
                          }
                        />
                      )}
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.kindLabel,
                        {
                          color: selected ? theme.colors.primary : theme.colors.text,
                        },
                      ]}
                    >
                      {t(k.labelKey)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        </RiseView>

        <RiseView delay={dayOffset !== 0 ? 240 : 180}>
          <DescriptionRow
            description={description}
            onChange={setDescription}
            quickSuggestions={quickDescriptions}
            onSelectSuggestion={handleSelectDescriptionSuggestion}
            warning={flagDescription}
          />
        </RiseView>

        {/* Date chips — same look as suggested-amount-strip chips,
            inline so the user can backdate without leaving the flow. */}
        <RiseView delay={dayOffset !== 0 ? 300 : 240}>
          <View>
            <Text
              style={[
                styles.sectionLabel,
                { color: theme.colors.textMuted },
              ]}
            >
              {t('gastos:addIncome.when')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.dayRow}
            >
              {([
                { offset: 0, labelKey: 'gastos:addIncome.dayChips.today' },
                { offset: 1, labelKey: 'gastos:addIncome.dayChips.yesterday' },
                { offset: 2, labelKey: 'gastos:addIncome.dayChips.dayBefore' },
              ] as const).map(({ offset, labelKey }) => (
                <Chip
                  key={offset}
                  label={t(labelKey)}
                  isActive={dayOffset === offset}
                  onPress={() => handleSelectDayOffset(offset)}
                />
              ))}
            </ScrollView>
          </View>
        </RiseView>

        {submitErrorMessage ? (
          <Text style={[typography.caption, styles.error, { color: theme.colors.danger }]}>
            {submitErrorMessage}
          </Text>
        ) : null}

        <RiseView delay={dayOffset !== 0 ? 360 : 300}>
          <View style={[styles.footer, { borderTopColor: theme.colors.line }]}>
            <AppButton
              label={t('gastos:addIncome.save')}
              variant="primary"
              loading={createMutation.isPending}
              disabled={false}
              lookDisabled={!canSubmit}
              onPress={handlePrimaryPress}
            />
            {!canSubmit && missingFields.length > 0 ? (
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
      </View>

      <InAppNumpad
        visible={numpadVisible}
        rawValue={rawAmount}
        onChangeRawValue={setRawAmount}
        onDismiss={() => setNumpadVisible(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  kindGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kindTile: {
    width: '48%',
    minHeight: 76,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  kindIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindIconImage: {
    width: 28,
    height: 28,
  },
  kindLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  dayRow: {
    gap: 6,
    paddingRight: 4,
    alignItems: 'center',
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
