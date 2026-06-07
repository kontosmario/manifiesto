import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { NumericEditSheet } from '@/components/ui/numeric-edit-sheet'
import { usePressScale } from '@/hooks/use-press-scale'
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
        title: '¿Cuál es tu saldo hoy?',
        contextPrefixLabel: 'Sueldo configurado',
        helperEmpty:
          'Anota el monto en mano. Lo usamos para arrancar este mes con la realidad.',
        saveLabel: 'Guardar saldo',
        eyebrow: 'O AJUSTÁ EL SALDO',
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
          'Anota el monto que recibiste este mes. Solo aplica a este mes.',
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

          <QuickConfirmCta
            label={copy.chipTitle}
            sublabel={copy.chipSubtitle}
            amount={formatMoney(monthlyIncome)}
            tone={tone}
            disabled={isSaving}
            a11yLabel={copy.chipA11y(formatMoney(monthlyIncome))}
            onPress={handleQuickConfirm}
          />
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

interface QuickConfirmCtaProps {
  label: string
  sublabel: string
  amount: string
  tone: ReturnType<typeof resolveTone>
  disabled: boolean
  a11yLabel: string
  onPress: () => void
}

/**
 * CTA primaria del sheet de cobro — antes era una "chip card" sutil
 * (alpha bg, border, chevron) que el user no identificaba como botón.
 * Rediseñada como CTA primaria saturada: background filled tone,
 * texto blanco, sombra leve para elevación, press scale 0.97 con
 * spring (usePressScale), touch target 56pt+ — clara afordancia táctil.
 *
 * Principios aplicados:
 *   - impeccable: filled color para primary action, elevación clara
 *   - emil-design-eng: scale 0.97 on press con spring (no opacity flash);
 *     "buttons must feel responsive"
 *   - ui-ux-pro-max: touch target ≥44pt (acá ~56pt), affordance no
 *     ambigua (no parece card), shadow consistente
 */
function QuickConfirmCta({
  label,
  sublabel,
  amount,
  tone,
  disabled,
  a11yLabel,
  onPress,
}: QuickConfirmCtaProps) {
  const press = usePressScale({ pressedScale: 0.97 })
  return (
    <Animated.View style={[styles.ctaWrap, press.animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[
          styles.ctaPressable,
          {
            backgroundColor: tone.filled,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
      >
        <View style={[styles.ctaIcon, { backgroundColor: tone.iconOverlay }]}>
          <MaterialIcons name="check" size={18} color={tone.iconFg} />
        </View>
        <View style={styles.ctaTextWrap}>
          <Text style={[styles.ctaLabel, { color: tone.textOnFilled }]}>
            {label}
          </Text>
          <Text style={[styles.ctaSublabel, { color: tone.textMutedOnFilled }]}>
            {sublabel}
            {' · '}
            <Text style={{ color: tone.textOnFilled, fontWeight: '800' }}>
              {amount}
            </Text>
          </Text>
        </View>
        <View style={[styles.ctaArrow, { backgroundColor: tone.iconOverlay }]}>
          <MaterialIcons name="arrow-forward" size={16} color={tone.iconFg} />
        </View>
      </Pressable>
    </Animated.View>
  )
}

function resolveTone(
  theme: ReturnType<typeof useAppTheme>['theme'],
  chipTone: ChipTone,
) {
  if (chipTone === 'peach') {
    return {
      // Filled solid CTA — el usuario lo lee como botón sin dudar.
      filled: '#E8976A',
      // Overlay sutil sobre el filled (para el icon circle y el arrow).
      iconOverlay: 'rgba(255,255,255,0.22)',
      iconFg: '#FFFFFF',
      textOnFilled: '#FFFFFF',
      textMutedOnFilled: 'rgba(255,255,255,0.78)',
      shadowColor: '#E8976A',
    }
  }
  return {
    filled: theme.colors.primary,
    iconOverlay: 'rgba(255,255,255,0.22)',
    iconFg: '#FFFFFF',
    textOnFilled: '#FFFFFF',
    textMutedOnFilled: 'rgba(255,255,255,0.78)',
    shadowColor: theme.colors.primary,
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
  // CTA wrapper: contiene la shadow para elevación (el Pressable
  // adentro ya tiene el bg filled).
  ctaWrap: {
    borderRadius: radii.lg,
    // boxShadow se interpreta como elevation en RN nuevo
    // ('0px 6px 14px -4px rgba(0,0,0,0.28)') — flat sin sombra
    // en plataformas sin support.
    boxShadow: '0px 6px 14px -4px rgba(0,0,0,0.28)' as unknown as string,
  },
  ctaPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radii.lg,
    minHeight: 56,
  },
  ctaIcon: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTextWrap: {
    flex: 1,
    gap: 2,
  },
  ctaLabel: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  ctaSublabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  ctaArrow: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ────────── Legacy chip styles (kept for back-compat if otros call-sites
  // todavía referencian; no se usan en el rediseño actual) ──────────
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
