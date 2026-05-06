import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { NumericEditSheet } from '@/components/ui/numeric-edit-sheet'
import { triggerHaptic } from '@/lib/haptics'
import {
  currencyFormatter,
  formatMoney,
  formatPriceInputValue,
  parsePrice,
  serializePrice,
} from '@/utils/money'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Two distinct, never-overlapping flows live in this file:
 *
 *   ┌─────────────────────────────┬───────────────────────────────────┐
 *   │ OnboardingAvailableSheet    │ SalaryConfirmationSheet           │
 *   ├─────────────────────────────┼───────────────────────────────────┤
 *   │ ONE-SHOT after the wizard.  │ RECURRING. Fires every cycle when │
 *   │ Triggers when the user has  │ payday is past and the user       │
 *   │ no `current_cycle_anchor`   │ hasn't confirmed yet.             │
 *   │ stored yet.                 │                                   │
 *   ├─────────────────────────────┼───────────────────────────────────┤
 *   │ "What CASH ON HAND do you   │ "Did you GET PAID this month?     │
 *   │  have right now?"           │  How much landed?"                │
 *   ├─────────────────────────────┼───────────────────────────────────┤
 *   │ Tone: setup, present.       │ Tone: event confirmation, past.   │
 *   │ Brand-green accent.         │ Peach/warning accent.             │
 *   ├─────────────────────────────┼───────────────────────────────────┤
 *   │ Quick chip: "Tengo el       │ Quick chip: "Cobré $X · igual al  │
 *   │  sueldo completo · $X"      │  sueldo recurrente"               │
 *   └─────────────────────────────┴───────────────────────────────────┘
 *
 * Both ultimately call the same backend writer
 * (`buildCycleStartingBalanceInput` upstream) — anchor + balance +
 * lastSalaryConfirmedAt — but they're surfaced as separate components
 * so callers can never accidentally render the wrong one.
 *
 * Trigger logic lives in `home-dashboard.tsx`:
 *   • storedAnchor == null → OnboardingAvailableSheet (one-shot)
 *   • storedAnchor != null && pending → SalaryConfirmationSheet
 *
 * Settings does NOT mount either of these — once the onboarding
 * value is set, recalibration only happens through the recurring
 * salary confirmation flow.
 */

type ChipTone = 'brand' | 'peach'

interface SharedProps {
  visible: boolean
  monthlyIncome: number
  remainingDaysInCycle: number
  isSaving: boolean
  errorMessage?: string | null
  onClose: () => void
  /** Persists the user-corrected balance for the cycle. */
  onSaveBalance: (amount: number) => void
  /**
   * Persists "no override, use the recurring salary as the cycle's
   * starting balance". Stamps `lastSalaryConfirmedAt` upstream, so it
   * also releases the salary-pending engine freeze.
   */
  onKeepDefault: () => void
}

interface InternalCopyConfig {
  title: string
  contextPrefixLabel: string
  helperEmpty: string
  saveLabel: string
  eyebrow: string
  chipTitle: string
  chipSubtitle: string
  chipA11y: (formatted: string) => string
  chipTone: ChipTone
}

// ─── Public components ──────────────────────────────────────────────

/**
 * One-shot sheet shown right after the user finishes the onboarding
 * wizard. Sets the cycle's starting cash on hand.
 *
 * Wording is framed in present-continuous tense ("Tengo…") because
 * the user hasn't received a payment — they're declaring what they
 * already have on hand at the moment of setup.
 */
export function OnboardingAvailableSheet(props: SharedProps) {
  return (
    <CycleBalancePromptSheetBase
      {...props}
      copy={{
        title: '¿Cuánto tienes disponible hoy?',
        contextPrefixLabel: 'Sueldo configurado',
        helperEmpty:
          'Anota el monto en mano. Lo usamos para arrancar este ciclo con la realidad.',
        saveLabel: 'Guardar disponible',
        eyebrow: 'O AJUSTÁ EL DISPONIBLE',
        chipTitle: 'Tengo el sueldo completo',
        chipSubtitle: 'Igual al monto configurado',
        chipA11y: (formatted) =>
          `Tengo el sueldo completo de ${formatted}, igual al monto configurado`,
        chipTone: 'brand',
      }}
    />
  )
}

/**
 * Recurring sheet shown each new pay cycle when the salary-pending
 * freeze is active. Confirms the actual amount received so the daily
 * cap recalculates against the real income for the month.
 *
 * Wording is framed in past tense ("Cobré…") because it's confirming
 * an event that already happened.
 */
export function SalaryConfirmationSheet(props: SharedProps) {
  return (
    <CycleBalancePromptSheetBase
      {...props}
      copy={{
        title: '¿Cobraste? Confirma el monto',
        contextPrefixLabel: 'Sueldo recurrente',
        helperEmpty:
          'Anota el monto que recibiste este mes. Solo aplica a este ciclo.',
        saveLabel: 'Guardar cobro',
        eyebrow: 'O AJUSTÁ EL MONTO COBRADO',
        chipTitle: 'Cobré el sueldo completo',
        chipSubtitle: 'Igual al sueldo recurrente',
        chipA11y: (formatted) =>
          `Cobré ${formatted}, igual al sueldo recurrente`,
        chipTone: 'peach',
      }}
    />
  )
}

// ─── Shared internal renderer ───────────────────────────────────────

interface BaseProps extends SharedProps {
  copy: InternalCopyConfig
}

function CycleBalancePromptSheetBase({
  visible,
  monthlyIncome,
  remainingDaysInCycle,
  isSaving,
  errorMessage,
  onClose,
  onSaveBalance,
  onKeepDefault,
  copy,
}: BaseProps) {
  const { theme } = useAppTheme()
  const [draft, setDraft] = useState(() => serializePrice(monthlyIncome))

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft on each open
      setDraft(serializePrice(monthlyIncome))
    }
  }, [visible, monthlyIncome])

  const parsed = useMemo(() => parsePrice(draft), [draft])
  const isValid = Number.isFinite(parsed) && parsed > 0
  const showError = !isValid && draft.length > 0
  const matchesSalary = isValid && parsed === monthlyIncome

  const handleQuickConfirm = () => {
    if (isSaving) return
    void triggerHaptic('success')
    onKeepDefault()
  }

  const tone = resolveTone(theme, copy.chipTone)

  return (
    <NumericEditSheet
      visible={visible}
      title={copy.title}
      rawValue={draft}
      onChangeRawValue={setDraft}
      formatDisplay={(raw) => formatPriceInputValue(raw, false)}
      displayEyebrow={copy.eyebrow}
      displayPlaceholder="$ 0"
      maxIntegerDigits={11}
      maxDecimalDigits={2}
      headerExtra={
        <View style={styles.headerStack}>
          <Text style={[styles.contextLine, { color: theme.colors.textMuted }]}>
            {copy.contextPrefixLabel}{' '}
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
              {currencyFormatter.format(monthlyIncome)}
            </Text>
            {' · '}
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
              {remainingDaysInCycle}
            </Text>{' '}
            {remainingDaysInCycle === 1 ? 'día restante' : 'días restantes'}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.chipA11y(formatMoney(monthlyIncome))}
            disabled={isSaving}
            onPress={handleQuickConfirm}
            style={({ pressed }) => [
              styles.quickConfirm,
              {
                backgroundColor: tone.background,
                borderColor: tone.border,
                opacity: pressed && !isSaving ? 0.85 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.quickConfirmIcon,
                { backgroundColor: tone.iconBg },
              ]}
            >
              <MaterialIcons name="check" size={16} color={tone.iconFg} />
            </View>
            <ChipBody
              title={copy.chipTitle}
              subtitle={copy.chipSubtitle}
              amount={formatMoney(monthlyIncome)}
              titleColor={tone.titleColor}
              subColor={theme.colors.textMuted}
              amountColor={tone.titleColor}
            />
            <MaterialIcons
              name="chevron-right"
              size={20}
              color={tone.titleColor}
            />
          </Pressable>
        </View>
      }
      helper={
        isValid
          ? `~${currencyFormatter.format(
              parsed / Math.max(remainingDaysInCycle, 1),
            )} por día hasta fin de ciclo.`
          : copy.helperEmpty
      }
      errorText={
        showError ? 'Tiene que ser mayor a cero.' : errorMessage ?? undefined
      }
      saveLabel={copy.saveLabel}
      saveDisabled={!isValid || matchesSalary}
      isSaving={isSaving}
      onSave={() => {
        if (!isValid || matchesSalary) return
        onSaveBalance(parsed)
      }}
      onClose={onClose}
    />
  )
}

interface ChipBodyProps {
  title: string
  subtitle: string
  amount: string
  titleColor: string
  subColor: string
  amountColor: string
}

function ChipBody({
  title,
  subtitle,
  amount,
  titleColor,
  subColor,
  amountColor,
}: ChipBodyProps): ReactNode {
  return (
    <View style={styles.quickConfirmText}>
      <Text style={[styles.quickConfirmTitle, { color: titleColor }]}>
        {title}
      </Text>
      <Text style={[styles.quickConfirmSub, { color: subColor }]}>
        {subtitle}
        {' · '}
        <Text style={{ color: amountColor, fontWeight: '700' }}>{amount}</Text>
      </Text>
    </View>
  )
}

function resolveTone(
  theme: ReturnType<typeof useAppTheme>['theme'],
  chipTone: ChipTone,
) {
  if (chipTone === 'peach') {
    return {
      background: 'rgba(232,151,106,0.16)',
      border: 'rgba(232,151,106,0.55)',
      iconBg: '#E8976A',
      iconFg: '#FFFFFF',
      titleColor: '#C25A3E',
    }
  }
  return {
    background: theme.colors.primarySurface,
    border: theme.colors.primary,
    iconBg: theme.colors.primary,
    iconFg: '#FFFFFF',
    titleColor: theme.colors.primaryStrong,
  }
}

const styles = StyleSheet.create({
  headerStack: {
    gap: 12,
  },
  contextLine: {
    fontSize: 13,
    lineHeight: 18,
  },
  quickConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  quickConfirmIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickConfirmText: {
    flex: 1,
    gap: 2,
  },
  quickConfirmTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  quickConfirmSub: {
    fontSize: 11,
    fontWeight: '500',
  },
})
