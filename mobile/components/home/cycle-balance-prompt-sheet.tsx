import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { NumericEditSheet } from '@/components/ui/numeric-edit-sheet'
import { usePressScale } from '@/hooks/use-press-scale'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
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
            tone={tone}
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
  tone: ReturnType<typeof resolveTone>
  disabled: boolean
  a11yLabel: string
  onPress: () => void
}

/**
 * CTA primaria del sheet de cobro — rediseño jerárquico con
 * animación idle.
 *
 * Iteración 2 (2026-06-07): el user pidió "mejor formato y estilo" +
 * "alguna animacion". Esta versión cambia la jerarquía visual:
 *   - Eyebrow chico arriba ("CONFIRMAR")
 *   - Amount grande como hero (la decisión del user es el monto)
 *   - Sublabel chico abajo (contexto)
 *   - Arrow circle a la derecha con idle pulse (1 → 1.08 cada 2.4s,
 *     respetando reduced-motion)
 *   - Press scale 0.97 spring sobre todo
 *
 * Principios aplicados:
 *   - impeccable: hierarchy via scale/weight (no flat); motion
 *     respira/atrae sin distraer
 *   - emil-design-eng: idle pulse decorative pero contenido; press
 *     spring inmediato
 *   - ui-ux-pro-max: touch target ≥44pt; affordance "tap to confirm"
 *     reforzada por el pulse del arrow
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
  const reducedMotion = useReducedMotion()
  // Pulse SUTIL del card completo (scale 1 → 1.012 → 1, ~1.6s loop).
  // El "respiración" en toda la tarjeta comunica "esto es interactivo"
  // sin ser intrusivo. Combinado con press scale 0.97 vía Animated.View
  // anidado — las transformaciones de scale en jerarquía se
  // multiplican naturalmente.
  const pulse = useSharedValue(1)

  useEffect(() => {
    if (reducedMotion || disabled) {
      cancelAnimation(pulse)
      pulse.value = 1
      return
    }
    pulse.value = withRepeat(
      withSequence(
        // @motion-allow: 800ms idle CTA pulse (cycle 1.6s total) — calibrado para llamar atención sin distraer; entre decorativeDurations.shimmer (1400) y pulse (1200) por diseño.
        withTiming(1.012, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        // @motion-allow: 800ms — paired with the up-phase above.
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    )
    return () => {
      cancelAnimation(pulse)
    }
  }, [reducedMotion, disabled, pulse])

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }))

  return (
    // Outer wrapper: pulse breathing (idle). Inner wrapper: press
    // scale. Nested → transforms multiplican.
    <Animated.View style={[styles.ctaWrap, pulseAnimatedStyle]}>
      <Animated.View style={press.animatedStyle}>
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
            <MaterialIcons name="check-circle" size={22} color={tone.iconFg} />
          </View>
          <View style={styles.ctaTextWrap}>
            <Text style={[styles.ctaEyebrow, { color: tone.textMutedOnFilled }]}>
              {label.toUpperCase()}
            </Text>
            <Text
              style={[styles.ctaAmount, { color: tone.textOnFilled }]}
              numberOfLines={1}
            >
              {amount}
            </Text>
            <Text style={[styles.ctaSublabel, { color: tone.textMutedOnFilled }]}>
              {sublabel}
            </Text>
          </View>
          <View style={[styles.ctaArrow, { backgroundColor: tone.iconOverlay }]}>
            <MaterialIcons name="arrow-forward" size={18} color={tone.iconFg} />
          </View>
        </Pressable>
      </Animated.View>
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
      iconOverlay: 'rgba(15,46,31,0.16)',
      // Fill peach CLARO (#E8976A) → texto/icono OSCURO (blanco daba 1.95-2.32:1;
      // forest #0F2E1F da ~8:1). Mismo criterio que el brand tone en dark.
      iconFg: '#0F2E1F',
      textOnFilled: '#0F2E1F',
      textMutedOnFilled: 'rgba(15,46,31,0.88)',
      shadowColor: '#E8976A',
    }
  }
  // Brand tone — primary del theme. Theme-aware para legibilidad:
  //   • Light: primary = #297811 (forest deep) → text white (5.7:1 AA)
  //   • Dark: primary = #A6EF8F (bright lime) → text FOREST DEEP
  //     (#0F2E1F) en vez de near-black. Feedback owner: "me gustaria
  //     un tono mas clarito acorde al darkmode, pero no negro oscuro".
  //     #0F2E1F (forest, mismo que usa el wrapped) → 9.7:1 AAA
  //     mantiene legibilidad y se siente brand, no pure black.
  if (theme.isDark) {
    return {
      filled: theme.colors.primary, // #A6EF8F bright lime
      // Overlay forest sutil sobre el lime claro (no near-black).
      iconOverlay: 'rgba(15, 46, 31, 0.16)',
      iconFg: '#0F2E1F',
      textOnFilled: '#0F2E1F',
      textMutedOnFilled: 'rgba(15, 46, 31, 0.70)',
      shadowColor: theme.colors.primary,
    }
  }
  return {
    filled: theme.colors.primary, // #297811 forest deep
    iconOverlay: 'rgba(255,255,255,0.22)',
    iconFg: '#FFFFFF',
    textOnFilled: '#FFFFFF',
    // 0.92 para que eyebrow/sublabel (texto chico) lleguen a AA (4.96:1)
    // sobre el forest deep; a 0.78 daban 4.04.
    textMutedOnFilled: 'rgba(255,255,255,0.92)',
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
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: radii.lg,
    minHeight: 76,
  },
  ctaIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
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
