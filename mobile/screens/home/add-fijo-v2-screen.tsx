import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
import { Screen } from '@/components/ui/screen'
import { InAppNumpad } from '@/components/ui/in-app-numpad'
import { StickyFooter } from '@/components/ui/sticky-footer'
import { AmountCard } from '@/components/home/amount-card'
import { CategoryHorizontalRail } from '@/components/home/category-horizontal-rail'
import { SuggestedAmountStrip } from '@/components/home/suggested-amount-strip'
import { RiseView } from '@/components/home/animated/rise-view'
import { pickIconForFixedExpenseCategory } from '@/features/gastos/category-icons'
import { useFixedExpenseCategories } from '@/features/categories/use-categories'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import {
  useCreateFixedExpense,
  useFixedExpenses,
  useUpdateFixedExpense,
} from '@/features/fixed-expenses/use-fixed-expenses'
import type { FixedExpenseFrequency } from '@/features/fixed-expenses/fixed-expense-types'
import { formatMoney, parsePrice, serializePrice } from '@/utils/money'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion'
import { errorMessages } from '@/lib/copy/states'
import { getErrorMessage } from '@/utils/error-message'
import { useAppTheme } from '@/theme/theme-provider'

interface AddFijoV2ScreenProps {
  familyId: string
  /** When set, the screen renders in "edit" mode — loads the existing
   * fijo, pre-fills the form, submits via useUpdateFixedExpense. */
  fixedExpenseId?: string
  /** Optional prefill when creating (from Asistente's
   *  "undetected-sub" suggestion). Ignored when editing. */
  prefillAmount?: number
  prefillDescription?: string
}

type Step = 1 | 2
type FreqChoice = FixedExpenseFrequency | 'cuotas'

const FREQ_OPTIONS: Array<{ id: FreqChoice; label: string; icon: string }> = [
  { id: 'monthly',    label: 'Mensual',    icon: '🗓' },
  { id: 'biweekly',   label: 'Quincenal',  icon: '🔁' },
  { id: 'weekly',     label: 'Semanal',    icon: '⏰' },
  { id: 'quarterly',  label: 'Trimestral', icon: '🌱' },
  { id: 'semiannual', label: 'Semestral',  icon: '🌗' },
  { id: 'annual',     label: 'Anual',      icon: '🎉' },
  { id: 'cuotas',     label: 'Cuotas',     icon: '💳' },
]

const CUOTA_OPTIONS = [3, 6, 12, 18, 24, 36] as const

const QUICK_AMOUNTS = [5000, 15000, 30000, 50000, 100000] as const

export function AddFijoV2Screen({
  familyId,
  fixedExpenseId,
  prefillAmount,
  prefillDescription,
}: AddFijoV2ScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const { width: windowWidth } = useWindowDimensions()
  // Compute a tile width that fills the row exactly when the 8 fijo
  // categories lay out as 4 columns × 2 rows. Screen has paddingH=20
  // each side; the rail adds paddingH=4 inside its scroll content; 3
  // gaps of 8pt sit between the 4 columns. Anything left over splits
  // evenly across tiles.
  const fijosTileWidth = Math.max(
    64,
    Math.floor((windowWidth - 40 - 8 - 24) / 4),
  )
  const fijosTileHeight = 80
  const isEditing = Boolean(fixedExpenseId)
  const categoriesQuery = useFixedExpenseCategories(familyId)
  const categories = categoriesQuery.data ?? []
  const financeQuery = useFamilyFinance(familyId)
  const monthlyIncome = financeQuery.data?.monthly_income ?? 0
  const existingFixedExpensesQuery = useFixedExpenses(familyId)
  const editingFijo = useMemo(
    () =>
      fixedExpenseId
        ? (existingFixedExpensesQuery.data ?? []).find((f) => f.id === fixedExpenseId) ?? null
        : null,
    [existingFixedExpensesQuery.data, fixedExpenseId],
  )
  // When editing, "prevTotal" excludes this item so the impact math
  // reflects the delta between the old amount and the new one.
  const prevTotal = useMemo(
    () =>
      (existingFixedExpensesQuery.data ?? [])
        .filter((i) => i.id !== fixedExpenseId)
        .reduce((s, i) => s + Number(i.amount ?? 0), 0),
    [existingFixedExpensesQuery.data, fixedExpenseId],
  )
  const createMutation = useCreateFixedExpense(familyId)
  const updateMutation = useUpdateFixedExpense(familyId)
  const pending = isEditing ? updateMutation.isPending : createMutation.isPending

  // When creating (no fixedExpenseId), seed from the Asistente's
  // "undetected-sub" prefill so the user lands on a half-filled form.
  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState(
    !fixedExpenseId && prefillDescription ? prefillDescription : '',
  )
  const [rawAmount, setRawAmount] = useState(
    !fixedExpenseId && prefillAmount && prefillAmount > 0
      ? serializePrice(prefillAmount)
      : '',
  )
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [freqChoice, setFreqChoice] = useState<FreqChoice>('monthly')
  const [cuotaTot, setCuotaTot] = useState(12)
  // No default day on create. Forcing the user to pick prevents the
  // "I'll just hit confirm without checking" reflex — the calendar
  // card pulses until a day is selected and the step-2 CTA is gated.
  const [day, setDay] = useState<number | null>(null)
  const [notify, setNotify] = useState(true)
  const [isNumpadVisible, setIsNumpadVisible] = useState(false)
  const [isNameFocused, setIsNameFocused] = useState(false)
  const [hydratedFromFijoId, setHydratedFromFijoId] = useState<string | null>(null)

  const parsedAmount = parsePrice(rawAmount)
  const amount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0

  // Any interaction with the form's other controls should release the
  // name input's focus and close the keyboard — the user has clearly
  // "moved on" from typing.
  const dismissNameKeyboard = () => {
    Keyboard.dismiss()
  }
  const addQuickAmount = (delta: number) => {
    dismissNameKeyboard()
    setRawAmount(serializePrice(amount + delta))
  }
  const clearAmount = () => {
    dismissNameKeyboard()
    setRawAmount('')
  }
  const openNumpad = () => {
    dismissNameKeyboard()
    void triggerHaptic('selection')
    setIsNumpadVisible(true)
  }
  const handleSelectCategory = (id: string) => {
    dismissNameKeyboard()
    setCategoryId(id)
  }
  const handleSelectFreq = (id: FreqChoice) => {
    dismissNameKeyboard()
    setFreqChoice(id)
  }

  // Hydrate form state from the fijo being edited, once it loads.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional one-shot hydration of form state from loaded record */
  useEffect(() => {
    if (!editingFijo || editingFijo.id === hydratedFromFijoId) return
    setName(editingFijo.name)
    setRawAmount(serializePrice(Number(editingFijo.amount ?? 0)))
    setCategoryId(editingFijo.category_id)
    if (editingFijo.kind === 'installment') {
      setFreqChoice('cuotas')
      setCuotaTot(editingFijo.installments_total ?? 12)
    } else {
      setFreqChoice(editingFijo.frequency)
    }
    setDay(editingFijo.day_of_month ?? new Date().getUTCDate())
    setNotify(editingFijo.notify_days_before != null)
    setHydratedFromFijoId(editingFijo.id)
  }, [editingFijo, hydratedFromFijoId])
  /* eslint-enable react-hooks/set-state-in-effect */

  const isInstallment = freqChoice === 'cuotas'
  const totalCuotas = isInstallment ? amount * cuotaTot : 0

  const selectedCategory = categories.find((c) => c.id === categoryId)
  const canContinue = amount > 0 && !!selectedCategory && name.trim().length > 0
  // Step-2 gate: day must be picked before the user can confirm.
  // Step 1 doesn't depend on the day (chosen in step 2 next to the
  // calendar preview).
  const canSubmit = canContinue && day != null

  const nuevoTotal = prevTotal + amount
  const pctAntes = monthlyIncome > 0 ? Math.round((prevTotal / monthlyIncome) * 100) : 0
  const pctDespues = monthlyIncome > 0 ? Math.round((nuevoTotal / monthlyIncome) * 100) : 0
  const deltaPct = pctDespues - pctAntes
  const libreDespues = Math.max(0, monthlyIncome - nuevoTotal)

  const handleClose = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)/fixed-expenses')
  }

  const handleConfirm = async () => {
    if (!canSubmit || !selectedCategory || day == null) return
    void triggerHaptic('success')
    const nextDueOn = buildNextDueOn(day)
    const basePayload = {
      amount,
      categoryId: selectedCategory.id,
      dayOfMonth: day,
      endsOn: null,
      // "Cuotas" in the UI maps to a monthly installment commitment —
      // the backend stores frequency='monthly' + kind='installment' +
      // installments_total. Other FreqChoices map 1:1 to the backend
      // frequency column with kind='recurring'.
      frequency: isInstallment ? 'monthly' : (freqChoice as FixedExpenseFrequency),
      installmentsPaid: editingFijo?.installments_paid ?? 0,
      installmentsTotal: isInstallment ? cuotaTot : null,
      kind: isInstallment ? ('installment' as const) : ('recurring' as const),
      lenderName: editingFijo?.lender_name ?? null,
      name: name.trim(),
      nextDueOn,
      notes: editingFijo?.notes ?? null,
      notifyDaysBefore: notify ? 2 : null,
      remainingBalance: editingFijo?.remaining_balance ?? null,
      status: editingFijo?.status ?? 'active',
    }
    try {
      if (isEditing && fixedExpenseId) {
        await updateMutation.mutateAsync({ ...basePayload, fixedExpenseId })
      } else {
        await createMutation.mutateAsync(basePayload)
      }
      handleClose()
    } catch (error) {
      void triggerHaptic('error')
      Alert.alert(
        isEditing ? 'No pudimos actualizar el fijo' : 'No pudimos crear el fijo',
        getErrorMessage(error, errorMessages.server),
      )
    }
  }

  const onHeaderBack = () => {
    if (step === 2) {
      setStep(1)
    } else {
      handleClose()
    }
  }

  return (
    <Screen showGrabHandle contentContainerStyle={styles.screen}>
      <Pressable style={styles.stack} onPress={Keyboard.dismiss}>
        <Animated.View layout={LinearTransition.duration(260)}>
          <StepHeader
            step={step}
            isEditing={isEditing}
            onBack={onHeaderBack}
            theme={theme}
          />
        </Animated.View>

        <Animated.View layout={LinearTransition.duration(260)}>
          <StepDots step={step} theme={theme} />
        </Animated.View>

        {step === 1 ? (
          <Animated.View
            key="step-1"
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(140)}
            layout={LinearTransition.duration(260)}
            style={styles.formStack}
          >
            <Field label="NOMBRE">
              <NameInput
                value={name}
                onChange={setName}
                isFocused={isNameFocused}
                onFocus={() => setIsNameFocused(true)}
                onBlur={() => setIsNameFocused(false)}
              />
            </Field>

            <AmountCard
              amount={amount}
              isActive={isNumpadVisible}
              onPress={openNumpad}
            />

            {isInstallment && amount > 0 ? (
              <Text style={[styles.cuotaInlineHint, { color: theme.colors.textMuted }]}>
                {cuotaTot} cuotas de{' '}
                <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                  {formatMoney(amount)}
                </Text>{' '}
                · Total{' '}
                <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                  {formatMoney(totalCuotas)}
                </Text>
              </Text>
            ) : null}

            <SuggestedAmountStrip
              amounts={[...QUICK_AMOUNTS]}
              currentAmount={amount}
              onAdd={addQuickAmount}
              onClear={clearAmount}
            />

            <CategoryHorizontalRail
              categories={categories}
              selectedCategoryId={categoryId ?? ''}
              onSelect={handleSelectCategory}
              rows={2}
              iconResolver={pickIconForFixedExpenseCategory}
              tileWidth={fijosTileWidth}
              tileHeight={fijosTileHeight}
            />

            <Field label="FRECUENCIA">
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
                    label={f.label}
                    selected={freqChoice === f.id}
                    onPress={() => handleSelectFreq(f.id)}
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
                    ¿CUÁNTAS CUOTAS?
                  </Text>
                  <View style={styles.cuotaRow}>
                    {CUOTA_OPTIONS.map((n) => {
                      const on = cuotaTot === n
                      return (
                        <Pressable
                          key={n}
                          onPress={() => {
                            dismissNameKeyboard()
                            setCuotaTot(n)
                          }}
                          style={[
                            styles.cuotaPill,
                            {
                              backgroundColor: on ? '#6B9AD6' : 'transparent',
                              borderColor: on
                                ? '#6B9AD6'
                                : theme.isDark
                                  ? '#2E4A6E'
                                  : '#A8BED4',
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${n} cuotas`}
                        >
                          <Text
                            style={[
                              styles.cuotaPillText,
                              { color: on ? '#F2EAD3' : theme.colors.text },
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
                      {cuotaTot} cuotas de{' '}
                      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                        {formatMoney(amount)}
                      </Text>{' '}
                      · Total{' '}
                      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                        {formatMoney(totalCuotas)}
                      </Text>
                    </Text>
                  ) : null}
                </Animated.View>
              ) : null}
            </Field>
          </Animated.View>
        ) : (
          <Animated.View
            key="step-2"
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(140)}
            layout={LinearTransition.duration(260)}
            style={styles.formStack}
          >
            <RiseView>
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
                ]}
              >
                <View
                  style={[
                    styles.summaryIcon,
                    {
                      backgroundColor: selectedCategory
                        ? hexAlpha(selectedCategory.color, 0.18)
                        : theme.colors.creamSoft,
                      borderColor: selectedCategory
                        ? hexAlpha(selectedCategory.color, 0.34)
                        : theme.colors.line,
                    },
                  ]}
                >
                  <Text style={styles.summaryIconText}>
                    {selectedCategory ? pickIconForFixedExpenseCategory(selectedCategory.name) : '📁'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.summaryName, { color: theme.colors.text }]}>{name}</Text>
                  <Text style={[styles.summaryMeta, { color: theme.colors.textMuted }]}>
                    {selectedCategory?.name ?? 'Sin categoría'} ·{' '}
                    {FREQ_OPTIONS.find((f) => f.id === freqChoice)?.label}
                    {isInstallment ? ` (${cuotaTot})` : ''}
                    {day != null ? ` · día ${day}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.summaryAmount, { color: theme.colors.text }]}>
                    {formatMoney(amount)}
                  </Text>
                  {isInstallment ? (
                    <Text style={[styles.summaryCuotaMeta, { color: theme.colors.textMuted }]}>
                      × {cuotaTot} · {formatMoney(totalCuotas)} total
                    </Text>
                  ) : null}
                </View>
              </View>
            </RiseView>

            <RiseView delay={80}>
              <View>
                <Text style={[styles.eyebrow, { color: theme.colors.textMuted, marginBottom: 8 }]}>
                  IMPACTO EN EL PRESUPUESTO
                </Text>
                <View
                  style={[
                    styles.impactCard,
                    { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
                  ]}
                >
                  <ImpactRow
                    label="TUS FIJOS ACTUALES"
                    value={formatMoney(prevTotal)}
                    sub={`${pctAntes}% del sueldo`}
                    theme={theme}
                  />
                  <ImpactRow
                    label="DESPUÉS DE AGREGAR"
                    value={formatMoney(nuevoTotal)}
                    sub={`${pctDespues}% del sueldo`}
                    emphasis
                    deltaPct={deltaPct}
                    theme={theme}
                  />
                  {monthlyIncome > 0 ? (
                    <ImpactBar
                      beforePct={pctAntes}
                      afterPct={pctDespues}
                    />
                  ) : null}
                  {monthlyIncome > 0 ? (
                    <View
                      style={[
                        styles.libreRow,
                        { backgroundColor: theme.colors.pageBg, borderColor: theme.colors.line },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.libreEyebrow, { color: theme.colors.textMuted }]}>
                          TE QUEDA LIBRE
                        </Text>
                        <Text style={[styles.libreValue, { color: theme.colors.text }]}>
                          {formatMoney(libreDespues)}
                        </Text>
                      </View>
                      <HealthBadge pct={pctDespues} />
                    </View>
                  ) : null}
                </View>
              </View>
            </RiseView>

            {selectedCategory ? (
              <RiseView delay={160}>
                <View>
                  <Text style={[styles.eyebrow, { color: theme.colors.textMuted, marginBottom: 8 }]}>
                    SE AGENDARÁ EN
                  </Text>
                  <CalendarDropImpact
                    day={day}
                    onChangeDay={setDay}
                    category={selectedCategory}
                    theme={theme}
                  />
                </View>
              </RiseView>
            ) : null}

            <RiseView delay={220}>
              <Pressable
                onPress={() => setNotify((n) => !n)}
                style={[
                  styles.reminderCard,
                  {
                    backgroundColor: notify
                      ? theme.isDark
                        ? 'rgba(166,239,143,0.18)'  // V1 primary-300 alpha
                        : '#EAFBE4'  // V1 primary-100
                      : theme.colors.creamCard,
                    borderColor: notify
                      ? theme.isDark
                        ? 'rgba(166,239,143,0.5)'
                        : '#49D61F'  // V1 primary-500
                      : theme.colors.line,
                  },
                ]}
                accessibilityRole="switch"
                accessibilityState={{ checked: notify }}
                accessibilityLabel="Recordatorio"
              >
                <View style={styles.reminderLeft}>
                  <Text allowFontScaling={false} style={styles.reminderEmoji}>
                    {notify ? '🔔' : '🔕'}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
                      RECORDATORIO
                    </Text>
                    <Text style={[styles.reminderText, { color: theme.colors.text }]}>
                      {notify ? 'Avisar 2 días antes' : 'Sin aviso'}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.reminderToggle,
                    {
                      backgroundColor: notify
                        ? theme.isDark
                          ? '#A6EF8F'  // V1 primary-300
                          : '#297811'  // V1 primary-800 (AA-safe text indicator)
                        : theme.colors.line,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.reminderToggleKnob,
                      {
                        backgroundColor: theme.colors.creamCard,
                        transform: [{ translateX: notify ? 18 : 2 }],
                      },
                    ]}
                  />
                </View>
              </Pressable>
            </RiseView>

          </Animated.View>
        )}
      </Pressable>

      <StickyFooter divider={false}>
        {step === 1 ? (
          <Pressable
            onPress={() => canContinue && setStep(2)}
            disabled={!canContinue}
            style={[
              styles.primaryCta,
              canContinue
                ? { backgroundColor: theme.colors.text }
                : { backgroundColor: theme.colors.line },
            ]}
            accessibilityRole="button"
            accessibilityLabel={canContinue ? 'Ver impacto' : 'Completa los datos'}
          >
            <Text
              style={[
                styles.primaryCtaText,
                {
                  color: canContinue ? theme.colors.creamCard : theme.colors.textMuted,
                },
              ]}
            >
              {canContinue ? 'Ver impacto →' : 'Completa los datos'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void handleConfirm()}
            disabled={pending || !canSubmit}
            style={[
              styles.primaryCta,
              canSubmit
                ? { backgroundColor: theme.colors.text, opacity: pending ? 0.7 : 1 }
                : { backgroundColor: theme.colors.line },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              !canSubmit
                ? 'Elige el día del mes'
                : isEditing
                  ? 'Actualizar fijo'
                  : 'Confirmar fijo'
            }
          >
            <Text
              style={[
                styles.primaryCtaText,
                {
                  color: canSubmit ? theme.colors.creamCard : theme.colors.textMuted,
                },
              ]}
            >
              {!canSubmit
                ? 'Elige el día del mes'
                : pending
                ? isEditing
                  ? 'Actualizando…'
                  : 'Creando…'
                : isEditing
                  ? 'Actualizar ✓'
                  : 'Confirmar y crear ✓'}
            </Text>
          </Pressable>
        )}
      </StickyFooter>

      <InAppNumpad
        visible={isNumpadVisible}
        rawValue={rawAmount}
        onChangeRawValue={setRawAmount}
        onDismiss={() => setIsNumpadVisible(false)}
      />
    </Screen>
  )
}

function StepHeader({
  step,
  isEditing,
  onBack,
  theme,
}: {
  step: Step
  isEditing: boolean
  /** Step 1 → close sheet. Step 2 → back to step 1. */
  onBack: () => void
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  const stepTitle =
    step === 1 ? (isEditing ? 'Editar fijo' : 'Nuevo fijo') : 'Revisa el impacto'
  return (
    <View style={styles.headerRow}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={step === 2 ? 'Volver al paso anterior' : 'Cerrar'}
        style={[
          styles.backPill,
          { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
        ]}
        hitSlop={10}
      >
        <MaterialIcons name="arrow-back-ios-new" size={18} color={theme.colors.text} />
      </Pressable>
      <Text style={[styles.title, { color: theme.colors.text }]}>{stepTitle}</Text>
      <View style={styles.headerRightSpacer} />
    </View>
  )
}

function StepDots({
  step,
  theme,
}: {
  step: Step
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  return (
    <View style={styles.dotsRow}>
      {[1, 2].map((s) => (
        <View
          key={s}
          style={[
            styles.stepBar,
            {
              backgroundColor: s <= step ? theme.colors.text : theme.colors.line,
            },
          ]}
        />
      ))}
    </View>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useAppTheme()
  return (
    <View>
      <Text style={[styles.eyebrow, { color: theme.colors.textMuted, marginBottom: 6 }]}>
        {label}
      </Text>
      {children}
    </View>
  )
}

function ImpactRow({
  label,
  value,
  sub,
  emphasis,
  deltaPct,
  theme,
}: {
  label: string
  value: string
  sub: string
  emphasis?: boolean
  deltaPct?: number
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  return (
    <View style={styles.impactRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.impactLabel, { color: theme.colors.textMuted }]}>{label}</Text>
        <Text
          style={[
            styles.impactValue,
            { color: theme.colors.text, fontSize: emphasis ? 22 : 18 },
          ]}
        >
          {value}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.impactSub, { color: theme.colors.textMuted }]}>{sub}</Text>
        {deltaPct != null && deltaPct !== 0 ? (
          <Text
            style={[
              styles.impactDelta,
              {
                color: theme.isDark
                  ? deltaPct > 0
                    ? '#F8D1C3'  // V1 accent-200
                    : '#A6EF8F'  // V1 primary-300
                  : deltaPct > 0
                    ? '#B84014'  // V1 accent-600
                    : '#297811',  // V1 primary-800
              },
            ]}
          >
            {deltaPct > 0 ? '+' : ''}
            {deltaPct}pp
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function HealthBadge({ pct }: { pct: number }) {
  const { theme } = useAppTheme()
  const tone: 'alto' | 'medio' | 'sano' = pct > 70 ? 'alto' : pct > 50 ? 'medio' : 'sano'
  // V1 health badge palette — alto/medio/sano = high/mid/healthy fijos
  // ratio. AA verified for fg-on-bg in both modes.
  const palette = theme.isDark
    ? {
        alto:  { bg: '#5C200A', fg: '#F8D1C3' },  // accent-900 / accent-200
        medio: { bg: '#7C2B0E', fg: '#FCEAE3' },  // accent-800 / accent-100
        sano:  { bg: '#244235', fg: '#A6EF8F' },  // surface-900 / primary-300
      }
    : {
        alto:  { bg: '#F8D1C3', fg: '#5C200A' },  // accent-200 / accent-900 — AAA
        medio: { bg: '#FCEAE3', fg: '#973511' },  // accent-100 / accent-700 — AA
        sano:  { bg: '#EAFBE4', fg: '#297811' },  // primary-100 / primary-800 — AA
      }
  const { bg, fg } = palette[tone]
  const label = tone === 'alto' ? 'Alto' : tone === 'medio' ? 'Medio' : 'Sano'
  return (
    <View style={[styles.healthBadge, { backgroundColor: bg }]}>
      <Text style={[styles.healthBadgeText, { color: fg }]}>{label}</Text>
    </View>
  )
}

/**
 * Month-agnostic day-of-month picker. Renders a 1–31 grid (the max
 * possible days a month can have) without weekday alignment — the day
 * recurs every month, so tying the layout to a specific calendar
 * month would be misleading. Tap any cell to set the day. Selected
 * cell shows the category emoji centered with the day number badged
 * in the corner.
 */
function CalendarDropImpact({
  day,
  onChangeDay,
  category,
  theme,
}: {
  day: number | null
  onChangeDay: (next: number) => void
  category: { id: string; name: string; color: string }
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  const reduceMotion = useReducedMotion()
  const emoji = pickIconForFixedExpenseCategory(category.name)
  const color = category.color
  const TOTAL_DAYS = 31

  // Pulse the card border + the prompt text while no day is selected.
  // Stops as soon as the user picks a day. Visual cue replaces "you
  // forgot to pick a day" copy/error state.
  const pulse = useSharedValue(0)
  useEffect(() => {
    if (day != null || reduceMotion) {
      pulse.value = 0
      return
    }
    // ease-in-out sin curve gives a soft, breathing rhythm — linear
    // timing felt mechanical and the color jumped at each boundary.
    pulse.value = withRepeat(
      withSequence(
        // @motion-allow: 950ms breathing pulse half-cycle with sin in/out for organic day-picker rhythm
        withTiming(1, { duration: 950, easing: Easing.inOut(Easing.sin) }),
        // @motion-allow: 950ms breathing pulse half-cycle with sin in/out for organic day-picker rhythm
        withTiming(0, { duration: 950, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    )
    return () => {
      // Modal can be closed mid-pulse; cancel the worklet driver so
      // it doesn't keep running on the UI runtime after unmount.
      cancelAnimation(pulse)
    }
  }, [day, reduceMotion, pulse])

  // Keep borderWidth fixed (set in styles.calendarCard) and only
  // animate the color. Animating borderWidth would change the inner
  // content rect by 2px on each pulse, re-firing onLayout on the
  // grid and visibly resizing the day cells in lockstep with the
  // pulse — making the calendar appear to "breathe".
  const cardPulseStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      pulse.value,
      [0, 1],
      [theme.colors.line, theme.colors.primary],
    ),
  }))

  return (
    <Animated.View
      style={[
        styles.calendarCard,
        { backgroundColor: theme.colors.creamCard },
        cardPulseStyle,
      ]}
    >
      <View style={styles.calendarGrid}>
        {Array.from({ length: TOTAL_DAYS }).map((_, idx) => {
          const n = idx + 1
          const isTarget = n === day

          return (
            <View key={`d-${n}`} style={styles.calendarCellWrap}>
              {isTarget ? (
                <Pressable
                  onPress={() => onChangeDay(n)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: true }}
                  accessibilityLabel={`Día ${n}, seleccionado`}
                  style={styles.calendarCell}
                >
                  <LinearGradient
                    colors={[color, hexAlpha(color, 0.82)] as unknown as readonly [string, string, ...string[]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        borderRadius: 8,
                        boxShadow: `0px 4px 10px -3px ${hexAlpha(color, 0.55)}`,
                      } as unknown as object,
                    ]}
                  />
                  <Text allowFontScaling={false} style={styles.calendarCellEmoji}>
                    {emoji}
                  </Text>
                  <View
                    style={[
                      styles.calendarCellDayBadge,
                      { backgroundColor: 'rgba(255,255,255,0.85)' },
                    ]}
                  >
                    <Text style={styles.calendarCellDayBadgeText}>{n}</Text>
                  </View>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => onChangeDay(n)}
                  accessibilityRole="button"
                  accessibilityLabel={`Día ${n}`}
                  style={({ pressed }) => [
                    styles.calendarCell,
                    {
                      backgroundColor: theme.colors.creamSoft,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.calendarCellNum, { color: theme.colors.text }]}
                  >
                    {n}
                  </Text>
                </Pressable>
              )}
            </View>
          )
        })}
      </View>

      {day != null ? (
        <Text style={[styles.calendarFoot, { color: theme.colors.textMuted }]}>
          Toca un día para cambiar ·{' '}
          <Text style={{ color: theme.colors.text, fontWeight: '800' }}>día {day}</Text>{' '}
          de cada mes
        </Text>
      ) : (
        <Text
          style={[
            styles.calendarFoot,
            styles.calendarFootPrompt,
            { color: theme.colors.primary },
          ]}
        >
          Elige el día del mes
        </Text>
      )}
    </Animated.View>
  )
}

function ImpactBar({ beforePct, afterPct }: { beforePct: number; afterPct: number }) {
  const { theme } = useAppTheme()
  const clampedBefore = Math.max(0, Math.min(100, beforePct))
  const clampedAfter = Math.max(0, Math.min(100, afterPct))
  return (
    <View
      style={[styles.impactBarTrack, { backgroundColor: theme.colors.pageBg }]}
    >
      <View style={[styles.impactBarFill, { width: `${clampedBefore}%` }]}>
        <LinearGradient
          colors={['#49D61F', '#297811'] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View
        style={[
          styles.impactBarFill,
          styles.impactBarDelta,
          {
            left: `${clampedBefore}%`,
            width: `${Math.max(0, clampedAfter - clampedBefore)}%`,
          },
        ]}
      >
        <LinearGradient
          colors={['#F2A78C', '#EC7A51'] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  )
}

function buildNextDueOn(day: number): string {
  const today = new Date()
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  // Try this month first; if `day` has already passed, roll to next month.
  const thisMonthDue = new Date(Date.UTC(year, month, day))
  if (thisMonthDue.getTime() < today.getTime() - 86_400_000) {
    const nextMonthDue = new Date(Date.UTC(year, month + 1, day))
    return nextMonthDue.toISOString().slice(0, 10)
  }
  return thisMonthDue.toISOString().slice(0, 10)
}

interface NameInputProps {
  value: string
  onChange: (next: string) => void
  isFocused: boolean
  onFocus: () => void
  onBlur: () => void
}

function NameInput({ value, onChange, isFocused, onFocus, onBlur }: NameInputProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const focusProgress = useSharedValue(isFocused ? 1 : 0)

  // Mirror AmountCard: interpolate the border color + width when focus
  // toggles, so the transition feels identical across the form.
  useEffect(() => {
    const target = isFocused ? 1 : 0
    focusProgress.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionDurations.standard })
  }, [isFocused, reduceMotion, focusProgress])

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focusProgress.value,
      [0, 1],
      [theme.colors.line, theme.colors.primary],
    ),
    borderWidth: 1 + focusProgress.value,
  }))

  return (
    <Animated.View
      style={[
        styles.textInputWrap,
        // Match AmountCard's `theme.colors.surface` so light mode reads
        // a single bg tone (white) across both inputs.
        { backgroundColor: theme.colors.surface },
        borderStyle,
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="Ej: Alquiler, Netflix, Cuota iPhone"
        placeholderTextColor={theme.colors.textSoft}
        style={[styles.textInputField, { color: theme.colors.text }]}
      />
    </Animated.View>
  )
}

interface FreqTileProps {
  icon: string
  label: string
  selected: boolean
  onPress: () => void
}

function FreqTile({ icon, label, selected, onPress }: FreqTileProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const selectedProgress = useSharedValue(selected ? 1 : 0)

  useEffect(() => {
    const target = selected ? 1 : 0
    selectedProgress.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionDurations.standard })
  }, [selected, reduceMotion, selectedProgress])

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      selectedProgress.value,
      [0, 1],
      [theme.colors.line, theme.colors.primary],
    ),
    borderWidth: 1 + selectedProgress.value,
  }))

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Animated.View
        style={[
          styles.freqTile,
          // Match the category rail tile bg (`theme.colors.surface`) so
          // both rails share the same light-mode tone instead of mixing
          // white categories with cream-tinted frequency tiles.
          { backgroundColor: theme.colors.surface },
          borderStyle,
        ]}
      >
        <Text allowFontScaling={false} style={styles.freqTileIcon}>
          {icon}
        </Text>
        <Text
          style={[styles.freqTileLabel, { color: theme.colors.text }]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

function hexAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  screen: { paddingTop: 4 },
  stack: { gap: 12, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    // Matches the breathing room the standard Screen header gives
    // (Screen paddingTop=4 + ScreenHeader paddingTop=10 = 14pt).
    marginTop: 14,
  },
  backPill: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  headerRightSpacer: { width: 40 },
  dotsRow: { flexDirection: 'row', gap: 6 },
  stepBar: { flex: 1, height: 3, borderRadius: 2 },
  formStack: { gap: 12 },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
  textInputWrap: {
    borderRadius: 14,
  },
  textInputField: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
  },
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
  freqTile: {
    width: 72,
    height: 72,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  freqTileIcon: {
    fontSize: 22,
    lineHeight: 26,
    textAlign: 'center',
    includeFontPadding: false,
  },
  freqTileLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: -0.1,
    textAlign: 'center',
    width: '100%',
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
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  reminderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  reminderEmoji: { fontSize: 22 },
  reminderText: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  reminderToggle: {
    width: 38,
    height: 22,
    borderRadius: 999,
    justifyContent: 'center',
  },
  reminderToggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 999,
  },
  primaryCta: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    // No marginHorizontal here: the StickyFooter sits inside the
    // Screen's ScrollView content, which already applies a 20pt
    // horizontal padding. Adding margin on top would double-pad
    // the CTA, leaving it ~40pt narrower than the inputs above.
  },
  primaryCtaText: { fontSize: 15, fontWeight: '800' },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  summaryIconText: { fontSize: 22 },
  summaryName: { fontSize: 15, fontWeight: '800' },
  summaryMeta: { fontSize: 11, marginTop: 2 },
  summaryAmount: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  summaryCuotaMeta: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  impactCard: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
  },
  impactRow: { flexDirection: 'row', alignItems: 'center' },
  impactLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  impactValue: { fontWeight: '800', letterSpacing: -0.4, marginTop: 2 },
  impactSub: { fontSize: 11, fontWeight: '600' },
  impactDelta: { fontSize: 11, fontWeight: '800', marginTop: 2 },
  impactBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
    position: 'relative',
  },
  impactBarFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 4,
    overflow: 'hidden',
  },
  impactBarDelta: {},
  libreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    borderStyle: 'dashed',
  },
  libreEyebrow: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  libreValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4, marginTop: 2 },
  healthBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  healthBadgeText: { fontSize: 11, fontWeight: '800' },
  calendarCard: {
    padding: 14,
    borderRadius: 16,
    // Fixed width so the pulse animation only changes color, not size.
    // Animating borderWidth would cause the inner grid to re-measure
    // and the day cells to bounce.
    borderWidth: 2,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Counter the cell-wrap padding so the outer edges of the grid
    // sit flush against the card's inner padding.
    marginHorizontal: -3,
    marginVertical: -3,
  },
  // The wrap takes exactly 1/7 of the grid width (no measurement
  // needed). Padding inside acts as the gap between cells, keeping
  // the layout pixel-perfect across all device widths and immune to
  // re-measurement during border animations.
  calendarCellWrap: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 3,
  },
  calendarCell: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  calendarCellNum: {
    fontSize: 13,
    fontWeight: '600',
  },
  calendarCellEmoji: {
    textAlign: 'center',
    includeFontPadding: false,
    fontSize: 18,
    lineHeight: 22,
  },
  calendarCellDayBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCellDayBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0A1410',
  },
  calendarFoot: {
    marginTop: 12,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  calendarFootPrompt: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
})
