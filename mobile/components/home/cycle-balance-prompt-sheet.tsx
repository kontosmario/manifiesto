import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
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
import { withAlpha } from '@/theme/color-utils'
import { cssGradient, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

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
  const { t } = useTranslation()
  return (
    <CycleBalancePromptSheetBase
      {...props}
      copy={{
        title: t('home:cycleBalance.onboarding.title'),
        contextPrefixLabel: t('home:cycleBalance.onboarding.contextPrefix'),
        helperEmpty: t('home:cycleBalance.onboarding.helperEmpty'),
        saveLabel: t('home:cycleBalance.onboarding.saveLabel'),
        eyebrow: t('home:cycleBalance.onboarding.eyebrow'),
        chipTitle: t('home:cycleBalance.onboarding.chipTitle'),
        chipSubtitle: t('home:cycleBalance.onboarding.chipSubtitle'),
        chipA11y: (formatted) =>
          t('home:cycleBalance.onboarding.chipA11y', { amount: formatted }),
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
  const { t } = useTranslation()
  return (
    <CycleBalancePromptSheetBase
      {...props}
      copy={{
        title: t('home:cycleBalance.salary.title'),
        contextPrefixLabel: t('home:cycleBalance.salary.contextPrefix'),
        helperEmpty: t('home:cycleBalance.salary.helperEmpty'),
        saveLabel: t('home:cycleBalance.salary.saveLabel'),
        eyebrow: t('home:cycleBalance.salary.eyebrow'),
        chipTitle: t('home:cycleBalance.salary.chipTitle'),
        chipSubtitle: t('home:cycleBalance.salary.chipSubtitle'),
        chipA11y: (formatted) =>
          t('home:cycleBalance.salary.chipA11y', { amount: formatted }),
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
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()
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
      // Numpad arranca colapsado — la primary action aquí es el quick
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
          <Text style={[styles.contextLine, { color: neo.textMuted }]}>
            {copy.contextPrefixLabel}{' '}
            <Text style={[styles.contextAmount, { color: neo.text }]}>
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
        showError ? t('home:cycleBalance.mustBePositive') : errorMessage ?? undefined
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
 * saldo). Rediseño neo: es el MISMO material que `NeoButton variant="primary"`
 * — radial `circle at 32% 28%` sobre `neo.ctaGradient` + `neo.shadows.cta` —
 * pero con el layout de tarjeta (ícono · monto · flecha) que este sheet ya
 * tenía, porque acá el CTA es una decisión con monto, no un botón de una
 * palabra.
 *
 * El gradiente va en el MISMO view que la sombra (vía `cssGradient`, no un
 * `LinearGradient` absolute-fill): en Android los inset del `boxShadow` se
 * dibujan en el drawable de fondo, DEBAJO de los children, así que una capa
 * de gradiente encima taparía la línea de luz de `shadows.cta` (mismo
 * razonamiento que el docblock de `NeoSurface`).
 *
 * El BORDER GLOW (`useBorderGlow`) sobrevive a la migración: Reanimated no
 * interpola strings de `boxShadow`, así que la única forma de conservar la
 * respiración del CTA es seguir animando `borderColor` — por eso este view
 * mantiene un `borderWidth` aunque el vocabulario neo separe por relieve.
 *
 * Jerarquía de tinta: todo el texto va en `neo.ctaText` (que YA codifica la
 * inversión del tema: crema en claro, tinta oscura en oscuro, porque el CTA
 * neo en oscuro es CLARO). La jerarquía la da la escala/tracking, no un
 * acento saturado ni alfas bajas: sobre un fill verde de luminancia media
 * bajar la opacidad del texto chico (eyebrow 10px) lo tira por debajo de AA.
 * Los dos íconos sí llevan `neo.heroGreen` porque se apoyan en tiles
 * hundidos oscuros. Press scale 0.97 (sin cambios).
 */
function QuickConfirmCta({
  label,
  sublabel,
  amount,
  disabled,
  a11yLabel,
  onPress,
}: QuickConfirmCtaProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const press = usePressScale({ pressedScale: 0.97 })
  const glowBorderStyle = useBorderGlow(!disabled)

  const ctaSurface = useMemo<ViewStyle>(
    () => ({
      ...cssGradient(
        `radial-gradient(circle at 32% 28%, ${neo.ctaGradient[0]}, ${neo.ctaGradient[1]} 85%)`,
        neo.ctaGradient[1],
      ),
      boxShadow: neo.shadows.cta,
    }),
    [neo],
  )

  // Tile hundido dentro del CTA. NO necesita el fallback de
  // `SUPPORTS_INSET_SHADOW`: el disco tiene fill propio (greenDeep al 28%
  // sobre el fill verde del botón), así que en Android < API 29 pierde el
  // bisel pero sigue siendo un disco visible.
  const ctaTile = useMemo<ViewStyle>(
    () => ({
      backgroundColor: withAlpha(neo.greenDeep, 0.28),
      boxShadow: neo.shadows.insetSm,
    }),
    [neo],
  )

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
        <Animated.View style={[styles.ctaCard, ctaSurface, glowBorderStyle]}>
          <View style={styles.ctaInner}>
            <View style={[styles.ctaIcon, ctaTile]}>
              <MaterialIcons name="check-circle" size={22} color={neo.heroGreen} />
            </View>
            <View style={styles.ctaTextWrap}>
              <Text style={[styles.ctaEyebrow, { color: neo.ctaText }]}>
                {label.toUpperCase()}
              </Text>
              <Text
                style={[styles.ctaAmount, { color: neo.ctaText }]}
                numberOfLines={1}
              >
                {amount}
              </Text>
              <Text style={[styles.ctaSublabel, { color: neo.ctaText }]}>
                {sublabel}
              </Text>
            </View>
            <View style={[styles.ctaArrow, ctaTile]}>
              <MaterialIcons name="arrow-forward" size={18} color={neo.heroGreen} />
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

// El `fontFamily` viaja SIEMPRE con el peso: cada peso de Nunito es un face
// estático propio, así que un `fontWeight` suelto no cambia la face.
const styles = StyleSheet.create({
  headerStack: {
    gap: 12,
  },
  contextLine: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  contextAmount: {
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  // Card de la CTA: fill radial `ctaGradient` + `shadows.cta` (los pinta el
  // componente, que necesita el tema) + border glow (useBorderGlow).
  ctaCard: {
    borderRadius: neoRadii.card,
    borderWidth: 1.5,
  },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 76,
  },
  // Los dos tiles (ícono y flecha) son pozos del sistema: el fill y la
  // sombra inset los pone el componente vía `ctaTile` (dependen del tema).
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
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.4,
  },
  ctaAmount: {
    fontSize: 20,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
    marginBottom: 2,
  },
  ctaSublabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  ctaArrow: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
