import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { NumericEditSheet } from '@/components/ui/numeric-edit-sheet'
import { useBorderGlow } from '@/hooks/use-border-glow'
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
        // 'brand' = primary forest green (calmo, on-brand, menos
        // agresivo que el peach saturado). Feedback owner:
        // "demasiado PEACH".
        chipTone: 'brand',
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
  remainingDaysInCycle: _remainingDaysInCycle,
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
      // Numpad arranca colapsado — la primary action acá es el quick
      // confirm CTA del header. El numpad de ajuste fino aparece solo
      // si el user tapea el display.
      numpadCollapsedByDefault
      headerExtra={
        <View style={styles.headerStack}>
          {/* Context line: nombre del sueldo configurado. El "días
              restantes" se sacó porque cuando este sheet aparece el
              cycle está FROZEN (cobro pendiente) y `remainingUntilPayday`
              quedaba clampeado a 1 — confundía al user con un falso
              countdown ("1 día restante") en vez de explicar que es el
              momento de confirmar el nuevo cobro. */}
          <Text style={[styles.contextLine, { color: theme.colors.textMuted }]}>
            {copy.contextPrefixLabel}{' '}
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
              {currencyFormatter.format(monthlyIncome)}
            </Text>
          </Text>

          <QuickConfirmCta
            label={copy.chipTitle}
            sublabel={copy.chipSubtitle}
            amount={formatMoney(monthlyIncome)}
            disabled={isSaving}
            a11yLabel={copy.chipA11y(formatMoney(monthlyIncome))}
            onPress={handleQuickConfirm}
          />
        </View>
      }
      // Helper "$X por día hasta fin de ciclo" removido (2026-06-07):
      // como `remainingDaysInCycle` está clampeado a 1 durante el cycle
      // freeze, la división daba todo-el-sueldo-por-día — engañoso. El
      // sheet ya tiene la decisión clara con el CTA primario; no hace
      // falta agregar metric load.
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
  disabled: boolean
  a11yLabel: string
  onPress: () => void
}

/**
 * CTA primaria del sheet de cobro ("tengo el sueldo completo" / confirmar el
 * saldo). Mismo lenguaje que la StartingBalanceCta del Home: gradiente forest
 * (heroGradient) + texto crema (heroText) + acento lime (heroAccent) + BORDER
 * GLOW (useBorderGlow) — el borde lime respira en lugar de un scale-pulse (que
 * recortaba los bordes). El gradiente se redondea a sí mismo para que el borde
 * no quede seamed en las esquinas. Jerarquía: eyebrow lime chico, monto crema
 * grande (la decisión del user es el monto), sublabel muted. Press scale 0.97.
 */
function QuickConfirmCta({
  label,
  sublabel,
  amount,
  disabled,
  a11yLabel,
  onPress,
}: QuickConfirmCtaProps) {
  const { theme } = useAppTheme()
  const press = usePressScale({ pressedScale: 0.97 })
  const glowBorderStyle = useBorderGlow(!disabled)

  return (
    <Animated.View style={press.animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={{ opacity: disabled ? 0.6 : 1 }}
      >
        <Animated.View style={[styles.ctaCard, glowBorderStyle]}>
          <LinearGradient
            colors={
              [...theme.colors.heroGradient] as unknown as readonly [
                string,
                string,
                ...string[],
              ]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            // Gradiente redondeado a sí mismo (sin overflow:hidden) → el borde
            // glow no queda seamed/cropeado en las esquinas.
            style={[StyleSheet.absoluteFillObject, styles.ctaGradient]}
          />
          <View style={styles.ctaInner}>
            <View style={styles.ctaIcon}>
              <MaterialIcons name="check-circle" size={22} color={theme.colors.heroAccent} />
            </View>
            <View style={styles.ctaTextWrap}>
              <Text style={[styles.ctaEyebrow, { color: theme.colors.heroAccent }]}>
                {label.toUpperCase()}
              </Text>
              <Text
                style={[styles.ctaAmount, { color: theme.colors.heroText }]}
                numberOfLines={1}
              >
                {amount}
              </Text>
              <Text style={[styles.ctaSublabel, { color: theme.colors.heroMuted }]}>
                {sublabel}
              </Text>
            </View>
            <View style={styles.ctaArrow}>
              <MaterialIcons name="arrow-forward" size={18} color={theme.colors.heroAccent} />
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  headerStack: {
    gap: 12,
  },
  contextLine: {
    fontSize: 13,
    lineHeight: 18,
  },
  // Card de la CTA: gradiente forest + border glow lime (useBorderGlow).
  ctaCard: {
    borderRadius: radii.lg,
    borderWidth: 1.5,
  },
  ctaGradient: {
    borderRadius: radii.lg,
  },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 76,
  },
  ctaIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    // Tile forest oscuro tenue → el ícono lime (heroAccent) resalta.
    backgroundColor: 'rgba(15,46,31,0.25)',
  },
  ctaTextWrap: {
    flex: 1,
    gap: 1,
  },
  ctaEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  ctaAmount: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
    marginBottom: 2,
  },
  ctaSublabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  ctaArrow: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,46,31,0.25)',
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
