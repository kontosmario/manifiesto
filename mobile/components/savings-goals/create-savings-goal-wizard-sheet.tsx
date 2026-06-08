import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { TextField } from '@/components/ui/text-field'
import { useUpsertSavingsGoal } from '@/features/savings-goals/use-upsert-savings-goal'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney, formatMoneyShort } from '@/utils/money'

export interface CreateSavingsGoalWizardSheetProps {
  visible: boolean
  familyId: string
  /** Pre-fill amount sugerido — usado cuando el user vino de "aportar X
   *  a meta", para que después del create la app pueda hacer el aporte
   *  automáticamente. El callback `onCreated` recibe el goal RAW del
   *  upsert para que el parent dispare la mutación de aporte con el id. */
  suggestedInitialAmount?: number
  /** Disparado en success — recibe el SavingsGoal recién creado. El
   *  parent decide qué hacer (e.g., aplicar reserva al nuevo goal). */
  onCreated: (goal: SavingsGoal) => void
  onClose: () => void
}

const STEP_COUNT = 4
const DEFAULT_EMOJI = '🎯'
const MAX_TITLE = 40

const MONTH_OPTIONS = [3, 6, 12, 24] as const
const DEFAULT_MONTHS = 12

/**
 * Wizard guiado para crear una meta de ahorro inline desde cualquier
 * surface — alcancía CTA, ReserveBlock "A una meta", o cualquier otro
 * punto donde antes aparecía un Alert genérico "Aún no tienes meta".
 *
 * 4 pasos:
 *   1. Título (con emoji por defecto 🎯)
 *   2. Monto objetivo (TextField numérico)
 *   3. Plazo (chips quick-select 3/6/12/24 + custom)
 *   4. Summary + submit (Crear meta / Crear y aportar $N)
 *
 * Estado interno se resetea cuando `visible` pasa de false → true
 * (igual que NumericEditSheet) — así el wizard arranca limpio cada vez
 * sin que el caller tenga que pasar `key={...}`.
 */
export function CreateSavingsGoalWizardSheet({
  visible,
  familyId,
  suggestedInitialAmount,
  onCreated,
  onClose,
}: CreateSavingsGoalWizardSheetProps) {
  const upsertMutation = useUpsertSavingsGoal(familyId)

  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [goalAmountText, setGoalAmountText] = useState('')
  const [targetMonths, setTargetMonths] = useState<number>(DEFAULT_MONTHS)
  const [customMonthsActive, setCustomMonthsActive] = useState(false)
  const [customMonthsText, setCustomMonthsText] = useState('')

  // Reset state on visible false→true transition. Match NumericEditSheet's
  // pattern: don't reset while the sheet is closing (so the user sees
  // continuous content while it slides down).
  useEffect(() => {
    if (!visible) return
    setStep(1)
    setTitle('')
    setGoalAmountText('')
    setTargetMonths(DEFAULT_MONTHS)
    setCustomMonthsActive(false)
    setCustomMonthsText('')
  }, [visible])

  const goalAmount = useMemo(() => {
    const digits = goalAmountText.replace(/[^\d]/g, '')
    return digits === '' ? 0 : parseInt(digits, 10)
  }, [goalAmountText])

  const customMonths = useMemo(() => {
    const digits = customMonthsText.replace(/[^\d]/g, '')
    if (digits === '') return null
    const value = parseInt(digits, 10)
    if (!Number.isFinite(value) || value <= 0) return null
    return Math.min(240, value)
  }, [customMonthsText])

  const effectiveMonths = customMonthsActive ? customMonths : targetMonths

  const monthlyEstimate =
    effectiveMonths != null && effectiveMonths > 0
      ? Math.ceil(goalAmount / effectiveMonths)
      : 0

  const titleTrimmed = title.trim()
  const canContinueStep1 = titleTrimmed.length > 0 && titleTrimmed.length <= MAX_TITLE
  const canContinueStep2 = goalAmount > 0
  const canContinueStep3 = effectiveMonths != null && effectiveMonths > 0

  const suggestedApply = suggestedInitialAmount && suggestedInitialAmount > 0
    ? suggestedInitialAmount
    : null

  const submitLabel = suggestedApply
    ? `Crear y aportar ${formatMoneyShort(suggestedApply)}`
    : 'Crear meta'

  const goNext = () => {
    void triggerHaptic('selection')
    setStep((s) => Math.min(STEP_COUNT, s + 1))
  }
  const goBack = () => {
    void triggerHaptic('selection')
    setStep((s) => Math.max(1, s - 1))
  }

  const handleSubmit = () => {
    if (!canContinueStep1 || !canContinueStep2 || !canContinueStep3) return
    upsertMutation.mutate(
      {
        input: {
          title: titleTrimmed,
          emoji: DEFAULT_EMOJI,
          goalAmount,
          currentAmount: 0,
          targetMonths: effectiveMonths ?? null,
          isActive: true,
        },
        existingId: null,
      },
      {
        onSuccess: (goal) => {
          void triggerHaptic('success')
          onCreated(goal)
        },
        onError: (err) => {
          void triggerHaptic('error')
          Alert.alert(
            'No pudimos crear la meta',
            err instanceof Error ? err.message : 'Reintenta en un momento.',
          )
        },
      },
    )
  }

  const stepTitle =
    step === 1
      ? 'Crear meta de ahorro · Paso 1 de 4'
      : step === 2
        ? 'Crear meta de ahorro · Paso 2 de 4'
        : step === 3
          ? 'Crear meta de ahorro · Paso 3 de 4'
          : 'Crear meta de ahorro · Resumen'

  const stepSubtitle =
    step === 1
      ? '¿Cómo le pondrías a tu meta?'
      : step === 2
        ? '¿Cuánto necesitás juntar?'
        : step === 3
          ? '¿En cuánto tiempo querés llegar?'
          : 'Revisá los detalles antes de crearla.'

  return (
    <ModalCard
      visible={visible}
      onClose={() => {
        if (upsertMutation.isPending) return
        onClose()
      }}
      title={stepTitle}
      subtitle={stepSubtitle}
    >
      <View style={styles.body}>
        <ProgressDots step={step} total={STEP_COUNT} />

        {step === 1 ? (
          <Step1Title
            title={title}
            onChangeTitle={setTitle}
            emoji={DEFAULT_EMOJI}
          />
        ) : null}

        {step === 2 ? (
          <Step2Amount
            goalAmountText={goalAmountText}
            onChangeAmount={setGoalAmountText}
            goalAmount={goalAmount}
          />
        ) : null}

        {step === 3 ? (
          <Step3Months
            targetMonths={targetMonths}
            customMonthsActive={customMonthsActive}
            customMonthsText={customMonthsText}
            onSelectPreset={(m) => {
              void triggerHaptic('selection')
              setCustomMonthsActive(false)
              setTargetMonths(m)
            }}
            onToggleCustom={() => {
              void triggerHaptic('selection')
              setCustomMonthsActive(true)
            }}
            onChangeCustomText={setCustomMonthsText}
          />
        ) : null}

        {step === 4 ? (
          <StepSummary
            emoji={DEFAULT_EMOJI}
            title={titleTrimmed}
            goalAmount={goalAmount}
            months={effectiveMonths ?? 0}
            monthlyEstimate={monthlyEstimate}
            suggestedApply={suggestedApply}
          />
        ) : null}

        <View style={styles.footerRow}>
          {step > 1 ? (
            <AppButton
              variant="ghost"
              label="Atrás"
              onPress={goBack}
              disabled={upsertMutation.isPending}
              fullWidth={false}
            />
          ) : null}

          {step < STEP_COUNT ? (
            <AppButton
              variant="primary"
              label="Continuar"
              onPress={goNext}
              disabled={
                (step === 1 && !canContinueStep1) ||
                (step === 2 && !canContinueStep2) ||
                (step === 3 && !canContinueStep3)
              }
              accessibilityLabel={`Continuar al paso ${step + 1} de ${STEP_COUNT}`}
            />
          ) : (
            <AppButton
              variant="primary"
              label={submitLabel}
              loading={upsertMutation.isPending}
              onPress={handleSubmit}
              accessibilityLabel={
                suggestedApply
                  ? `Crear meta y aportar ${formatMoney(suggestedApply)}`
                  : `Crear meta ${titleTrimmed}`
              }
            />
          )}
        </View>
      </View>
    </ModalCard>
  )
}

// ── Progress dots ────────────────────────────────────────────────────
interface ProgressDotsProps {
  step: number
  total: number
}

function ProgressDots({ step, total }: ProgressDotsProps) {
  const { theme } = useAppTheme()
  return (
    <View
      style={styles.dotsRow}
      accessibilityRole="progressbar"
      accessibilityLabel={`Paso ${step} de ${total}`}
    >
      {Array.from({ length: total }).map((_, idx) => {
        const active = idx + 1 <= step
        return (
          <View
            key={idx}
            style={[
              styles.dot,
              {
                backgroundColor: active
                  ? theme.colors.primary
                  : theme.colors.line,
                width: idx + 1 === step ? 22 : 8,
              },
            ]}
          />
        )
      })}
    </View>
  )
}

// ── Step 1 — Title ──────────────────────────────────────────────────
interface Step1TitleProps {
  title: string
  onChangeTitle: (v: string) => void
  emoji: string
}

function Step1Title({ title, onChangeTitle, emoji }: Step1TitleProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.stepBody}>
      <View
        style={[
          styles.emojiBubble,
          {
            backgroundColor: theme.isDark
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(15,42,30,0.05)',
            borderColor: theme.colors.line,
          },
        ]}
        accessibilityRole="image"
        accessibilityLabel="Emoji de la meta"
      >
        <Text style={styles.emojiGlyph}>{emoji}</Text>
      </View>
      <TextField
        label="Nombre de la meta"
        value={title}
        onChangeText={(v) => onChangeTitle(v.slice(0, MAX_TITLE))}
        placeholder="Ej: Viaje a Bariloche"
        autoCapitalize="sentences"
        accessibilityLabel="Nombre de la meta"
        helper={`${title.length}/${MAX_TITLE}`}
      />
    </View>
  )
}

// ── Step 2 — Amount ─────────────────────────────────────────────────
interface Step2AmountProps {
  goalAmountText: string
  onChangeAmount: (v: string) => void
  goalAmount: number
}

function Step2Amount({
  goalAmountText,
  onChangeAmount,
  goalAmount,
}: Step2AmountProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.stepBody}>
      <View
        style={[
          styles.amountPreview,
          {
            backgroundColor: theme.isDark
              ? 'rgba(255,255,255,0.04)'
              : 'rgba(15,42,30,0.04)',
            borderColor: theme.colors.line,
          },
        ]}
      >
        <Text style={[styles.amountEyebrow, { color: theme.colors.textMuted }]}>
          MONTO OBJETIVO
        </Text>
        <Text style={[styles.amountValue, { color: theme.colors.text }]}>
          {goalAmount > 0 ? formatMoney(goalAmount) : '$ 0'}
        </Text>
      </View>
      <TextField
        label="¿Cuánto querés juntar?"
        value={goalAmountText}
        onChangeText={onChangeAmount}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder="0"
        accessibilityLabel="Monto objetivo de la meta"
        helper="Solo números enteros — sin centavos."
      />
    </View>
  )
}

// ── Step 3 — Months ─────────────────────────────────────────────────
interface Step3MonthsProps {
  targetMonths: number
  customMonthsActive: boolean
  customMonthsText: string
  onSelectPreset: (months: number) => void
  onToggleCustom: () => void
  onChangeCustomText: (v: string) => void
}

function Step3Months({
  targetMonths,
  customMonthsActive,
  customMonthsText,
  onSelectPreset,
  onToggleCustom,
  onChangeCustomText,
}: Step3MonthsProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.stepBody}>
      <View style={styles.chipsRow}>
        {MONTH_OPTIONS.map((m) => {
          const isActive = !customMonthsActive && targetMonths === m
          return (
            <Pressable
              key={m}
              onPress={() => onSelectPreset(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${m} meses`}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: isActive
                    ? theme.colors.primary
                    : theme.isDark
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(15,42,30,0.04)',
                  borderColor: isActive ? theme.colors.primary : theme.colors.line,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: isActive
                      ? theme.isDark
                        ? theme.colors.background
                        : '#FFFFFF'
                      : theme.colors.text,
                  },
                ]}
              >
                {m} meses
              </Text>
            </Pressable>
          )
        })}
        <Pressable
          onPress={onToggleCustom}
          accessibilityRole="button"
          accessibilityState={{ selected: customMonthsActive }}
          accessibilityLabel="Plazo personalizado"
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: customMonthsActive
                ? theme.colors.primary
                : theme.isDark
                  ? 'rgba(255,255,255,0.05)'
                  : 'rgba(15,42,30,0.04)',
              borderColor: customMonthsActive
                ? theme.colors.primary
                : theme.colors.line,
              opacity: pressed ? 0.78 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.chipText,
              {
                color: customMonthsActive
                  ? theme.isDark
                    ? theme.colors.background
                    : '#FFFFFF'
                  : theme.colors.text,
              },
            ]}
          >
            Custom
          </Text>
        </Pressable>
      </View>
      {customMonthsActive ? (
        <TextField
          label="Plazo en meses"
          value={customMonthsText}
          onChangeText={onChangeCustomText}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="Ej: 18"
          accessibilityLabel="Plazo personalizado en meses"
        />
      ) : null}
    </View>
  )
}

// ── Step 4 — Summary ────────────────────────────────────────────────
interface StepSummaryProps {
  emoji: string
  title: string
  goalAmount: number
  months: number
  monthlyEstimate: number
  suggestedApply: number | null
}

function StepSummary({
  emoji,
  title,
  goalAmount,
  months,
  monthlyEstimate,
  suggestedApply,
}: StepSummaryProps) {
  const { theme } = useAppTheme()
  const cardBg = theme.isDark
    ? theme.colors.surfaceMuted
    : theme.colors.creamCard
  return (
    <View style={styles.stepBody}>
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: cardBg, borderColor: theme.colors.line },
        ]}
      >
        <View style={styles.summaryHeaderRow}>
          <Text style={styles.summaryEmoji}>{emoji}</Text>
          <Text
            style={[styles.summaryTitle, { color: theme.colors.text }]}
            numberOfLines={2}
          >
            {title || 'Mi meta de ahorro'}
          </Text>
        </View>
        <View
          style={[
            styles.summaryDivider,
            { backgroundColor: theme.colors.line },
          ]}
        />
        <Text style={[styles.summaryDetail, { color: theme.colors.text }]}>
          {formatMoney(goalAmount)} en {months} {months === 1 ? 'mes' : 'meses'}
        </Text>
        <Text
          style={[styles.summarySub, { color: theme.colors.textMuted }]}
        >
          ~ {formatMoney(monthlyEstimate)} por mes
        </Text>
        {suggestedApply ? (
          <View
            style={[
              styles.summaryApply,
              {
                backgroundColor: theme.isDark
                  ? 'rgba(122,216,163,0.16)'
                  : 'rgba(28,126,58,0.10)',
                borderColor: theme.isDark
                  ? 'rgba(122,216,163,0.32)'
                  : 'rgba(28,126,58,0.26)',
              },
            ]}
          >
            <Text style={[styles.summaryApplyText, { color: theme.colors.success }]}>
              Aportaremos {formatMoney(suggestedApply)} apenas se cree.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 14,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  stepBody: {
    gap: 14,
  },
  emojiBubble: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGlyph: {
    fontSize: 36,
    lineHeight: 42,
  },
  amountPreview: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'flex-start',
  },
  amountEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  amountValue: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryEmoji: {
    fontSize: 28,
  },
  summaryTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  summaryDetail: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  summarySub: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryApply: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  summaryApplyText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
})
