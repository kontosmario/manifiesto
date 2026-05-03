import { useMemo, useState } from 'react'
import { Alert, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
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
import { triggerHaptic } from '@/lib/haptics'
import { buildScreenHeaderPalette } from '@/theme/screen-header'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'
import { parsePrice } from '@/utils/money'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import { getErrorMessage } from '@/utils/error-message'

interface AddIncomeScreenProps {
  familyId: string
  userId: string
}

interface KindMeta {
  key: IncomeEventKind
  label: string
  icon: keyof typeof MaterialIcons.glyphMap
}

// Four constrained kinds — keeps server-side analytics tractable
// while covering the realistic mental model. Open-text `description`
// captures the rest.
const KINDS: KindMeta[] = [
  { key: 'transfer', label: 'Transferencia',  icon: 'swap-horiz' },
  { key: 'bonus',    label: 'Bono',           icon: 'workspace-premium' },
  { key: 'gift',     label: 'Regalo',         icon: 'card-giftcard' },
  { key: 'other',    label: 'Otro',           icon: 'attach-money' },
]

const SUGGESTED_DELTAS = [5000, 15000, 30000, 50000, 100000]

const QUICK_DESCRIPTIONS = [
  'Transferencia',
  'Aguinaldo',
  'Bono trabajo',
  'Regalo cumple',
  'Freelance',
  'Reintegro',
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
  const { theme } = useAppTheme()
  const headerPalette = buildScreenHeaderPalette(theme)

  const [rawAmount, setRawAmount] = useState('')
  const [kind, setKind] = useState<IncomeEventKind>('transfer')
  const [description, setDescription] = useState('')
  const [dayOffset, setDayOffset] = useState<0 | 1 | 2>(0)
  const [numpadVisible, setNumpadVisible] = useState(false)
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null)

  const createMutation = useCreateIncomeEvent()
  const parsedAmount = useMemo(() => parsePrice(rawAmount), [rawAmount])
  const hasValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0
  const canSubmit = hasValidAmount && Boolean(kind)

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
    const next = (Number.isFinite(parsedAmount) ? parsedAmount : 0) + delta
    setRawAmount(String(Math.round(next)))
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

  const handleSubmit = () => {
    if (!canSubmit) return
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
          const msg = getErrorMessage(err, 'Reintentá en un momento.')
          setSubmitErrorMessage(msg)
          Alert.alert('No pudimos guardar', msg)
        },
      },
    )
  }

  return (
    <Screen
      canGoBack
      showGrabHandle
      contentContainerStyle={styles.screenContent}
      title="Agregar ingreso"
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
                REGISTRANDO PARA
              </Text>
              <Text style={[styles.forDatePillValue, { color: theme.colors.text }]}>
                {dayOffset === 1 ? 'ayer' : 'anteayer'}
              </Text>
            </View>
          </RiseView>
        ) : null}

        <RiseView delay={dayOffset !== 0 ? 60 : 0}>
          <AmountCard
            amount={parsedAmount}
            isActive={numpadVisible}
            onPress={handleOpenNumpad}
            label="Monto del ingreso"
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
                { color: theme.colors.textMuted },
              ]}
            >
              ¿De dónde?
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
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.line,
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={k.label}
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
                      <MaterialIcons
                        name={k.icon}
                        size={20}
                        color={
                          selected
                            ? theme.isDark
                              ? '#12211A'
                              : '#FFFFFF'
                            : theme.colors.textMuted
                        }
                      />
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
                      {k.label}
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
            quickSuggestions={QUICK_DESCRIPTIONS}
            onSelectSuggestion={handleSelectDescriptionSuggestion}
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
              ¿Cuándo?
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.dayRow}
            >
              {([
                { offset: 0, label: 'Hoy' },
                { offset: 1, label: 'Ayer' },
                { offset: 2, label: 'Anteayer' },
              ] as const).map(({ offset, label }) => (
                <Chip
                  key={offset}
                  label={label}
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
              label="Guardar ingreso"
              variant="primary"
              loading={createMutation.isPending}
              disabled={!canSubmit}
              onPress={handleSubmit}
            />
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
  },
})
