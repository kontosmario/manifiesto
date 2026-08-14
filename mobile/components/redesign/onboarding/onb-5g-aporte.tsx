import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import { formatPesos } from './onb-format'
import { OnbCta, OnbHeader, OnbHero, OnbProgress, OnbScreenShell, OnbScrollBody } from './onb-kit'
import { ONB_MONTO_EDITING, OnbNumpad, useNumpadScrollAvoid } from './onb-numpad'
import { ONB_SPEC, ONB_SURFACES, type OnbMode } from './onb-spec'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * 5g · Tu aporte — ramal JOINER (espejo de step-income-contribution.tsx).
 * NO existe mockup: diseño nuevo en el lenguaje neumórfico del rediseño
 * (tiles con anillo de selección + card de monto tap-to-edit del 5d).
 * El usuario que se une decide si aporta al ingreso del hogar y, si
 * aporta, cuánto. Estado demo (sin mutaciones reales).
 *
 * Bloqueo del CTA: hasta elegir sí/no, y —si aporta— hasta cargar monto.
 */

/** Verde de acento por modo (caret del monto + texto del tile elegido). */
const ACCENT: Record<OnbMode, string> = {
  light: '#2E7C39',
  dark: '#A4E3A6',
}

/** Fallback sólido del gradiente idle del tile/card (por si no hay CSS bg). */
const IDLE_FALLBACK: Record<OnbMode, string> = {
  light: '#ECEDE1',
  dark: '#1B3023',
}

export function Onb5gAporte({
  mode,
  contributesIncome,
  contribution,
  onChange,
  onBack,
  onNext,
}: {
  mode: OnbMode
  contributesIncome: boolean | null
  contribution: number
  onChange: (patch: Partial<{ contributesIncome: boolean; contribution: number }>) => void
  onBack?: () => void
  onNext?: () => void
}) {
  const s = ONB_SPEC[mode]
  const { t } = useTranslation()
  // Numpad del monto (4j/4jo) como overlay de la screen — mismo patrón
  // que 5d: card read-only + tratamiento "en edición" mientras abre.
  const [numpadOpen, setNumpadOpen] = useState(false)
  // Keyboard-avoidance del numpad: sube la card de monto sobre la hoja.
  const scrollRef = useRef<ScrollView>(null)
  const montoRef = useRef<View>(null)
  const { onScroll, extraBottomPad } = useNumpadScrollAvoid({
    scrollRef,
    targetRef: montoRef,
    open: numpadOpen && contributesIncome === true,
  })

  const chooseYes = () => {
    void triggerHaptic('selection')
    onChange({ contributesIncome: true })
  }
  const chooseNo = () => {
    void triggerHaptic('selection')
    onChange({ contributesIncome: false })
    setNumpadOpen(false)
  }

  // Validación bloqueante: elegir sí/no y —si aporta— tener monto > 0.
  const missing =
    contributesIncome === null
      ? t('onboarding:incomeContribution.errorChoose')
      : contributesIncome === true && contribution <= 0
        ? t('onboarding:incomeContribution.errorAmount')
        : null

  const reveal = FadeInDown.duration(motionDurations.standard)

  return (
    <OnbScreenShell mode={mode}>
      <OnbScrollBody ref={scrollRef} onScroll={onScroll} extraBottomPad={extraBottomPad}>
        <OnbHeader mode={mode} title={t('onboarding:chrome.title.contribution')} onBack={onBack} />
        <OnbProgress mode={mode} active={3} />
        <OnbHero
          mode={mode}
          title={t('onboarding:incomeContribution.title')}
          subtitle={t('onboarding:incomeContribution.subcopy')}
          // Brot `coach`: acompaña la decisión sensible del aporte (el
          // copy tranquiliza — "si no, también está bien").
          brotPose="coach"
        />

        <View style={styles.choicesRow}>
          <ChoiceTile
            mode={mode}
            label={t('onboarding:incomeContribution.yes')}
            selected={contributesIncome === true}
            onPress={chooseYes}
          />
          <ChoiceTile
            mode={mode}
            label={t('onboarding:incomeContribution.no')}
            selected={contributesIncome === false}
            onPress={chooseNo}
          />
        </View>

        {contributesIncome === true ? (
          <Animated.View entering={reveal}>
            <Text style={[styles.eyebrow, { color: s.helper }]}>
              {t('onboarding:incomeContribution.incomeEyebrow')}
            </Text>
            {/* Wrapper con ref: blanco de medición del keyboard-avoidance. */}
            <View ref={montoRef}>
              <MontoCard
                mode={mode}
                monto={contribution}
                editing={numpadOpen}
                onOpen={() => setNumpadOpen(true)}
              />
            </View>
            <Text style={[styles.hint, { color: s.helper }]}>
              {t('onboarding:incomeContribution.hintContributes')}
            </Text>
          </Animated.View>
        ) : null}

        {contributesIncome === false ? (
          <Animated.View entering={reveal}>
            <View
              style={[
                styles.infoCard,
                {
                  experimental_backgroundImage: ONB_SURFACES[mode].cardGradientCss,
                  backgroundColor: IDLE_FALLBACK[mode],
                  boxShadow: ONB_SURFACES[mode].cardShadow,
                },
              ]}
            >
              <Text style={[styles.infoText, { color: s.text }]}>
                {t('onboarding:incomeContribution.infoNoContribute')}
              </Text>
            </View>
          </Animated.View>
        ) : null}

        <View style={styles.ctaWrap}>
          <OnbCta
            mode={mode}
            label={t('onboarding:cta.next')}
            disabled={missing !== null}
            disabledHint={missing ?? undefined}
            onPress={onNext}
          />
        </View>
      </OnbScrollBody>

      {/* Numpad como overlay full-width (fuera del scroll): solo mientras
          aporta. Tap fuera o "Listo" lo cierran. */}
      <OnbNumpad
        mode={mode}
        visible={numpadOpen && contributesIncome === true}
        value={contribution}
        onChange={(monto) => onChange({ contribution: monto })}
        onDone={() => setNumpadOpen(false)}
      />
    </OnbScreenShell>
  )
}

// ─── Tile de elección sí/no (idle elevado ↔ elegido con anillo verde) ─

function ChoiceTile({
  mode,
  label,
  selected,
  onPress,
}: {
  mode: OnbMode
  label: string
  selected: boolean
  onPress: () => void
}) {
  const s = ONB_SPEC[mode]
  const surf = ONB_SURFACES[mode]
  const press = usePressScale({ pressedScale: 0.97 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.choiceTile,
        selected
          ? { backgroundColor: surf.chipSelectedBackground, boxShadow: surf.chipSelectedShadow }
          : {
              experimental_backgroundImage: surf.cardGradientCss,
              backgroundColor: IDLE_FALLBACK[mode],
              boxShadow: surf.cardShadow,
            },
        press.animatedStyle,
      ]}
    >
      <Text
        style={[styles.choiceLabel, { color: selected ? surf.chipSelectedText : s.text }]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  )
}

// ─── Card de monto read-only tap-to-edit (patrón de la 5d) ───────────

function MontoCard({
  mode,
  monto,
  editing,
  onOpen,
}: {
  mode: OnbMode
  monto: number
  /** El numpad está abierto sobre esta card. */
  editing: boolean
  onOpen: () => void
}) {
  const s = ONB_SPEC[mode]
  const surf = ONB_SURFACES[mode]
  const edit = ONB_MONTO_EDITING[mode]
  const { t } = useTranslation()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('onboarding:incomeContribution.amountLabel')}
      onPress={onOpen}
      style={[
        styles.montoCard,
        editing
          ? { backgroundColor: edit.background, boxShadow: edit.shadow }
          : {
              experimental_backgroundImage: surf.cardGradientCss,
              backgroundColor: IDLE_FALLBACK[mode],
              boxShadow: surf.cardShadow,
            },
      ]}
    >
      <View style={styles.montoHeaderRow}>
        <Text style={[styles.montoLabel, { color: s.helper }]}>
          {t('onboarding:incomeContribution.amountLabel')}
        </Text>
        {editing ? null : (
          <Text style={[styles.montoEdit, { color: ACCENT[mode] }]}>
            {t('home:amountCard.tapToEdit')}
          </Text>
        )}
      </View>
      <View style={styles.montoAmountRow}>
        <Text style={[styles.montoAmount, { color: s.text }]}>{formatPesos(monto)}</Text>
        <View style={[styles.montoCaret, { backgroundColor: ACCENT[mode] }]} />
      </View>
    </Pressable>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  choicesRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  choiceTile: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceLabel: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.4,
    marginTop: 20,
    marginBottom: 8,
  },
  montoCard: {
    borderRadius: 26,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  montoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  montoLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  montoEdit: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  montoAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 6,
  },
  montoAmount: {
    fontSize: 36,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.72,
  },
  montoCaret: {
    width: 3,
    height: 30,
    borderRadius: 2,
    opacity: 0.7,
  },
  hint: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 10,
    lineHeight: 18,
  },
  infoCard: {
    marginTop: 18,
    borderRadius: 22,
    padding: 16,
  },
  infoText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 19,
  },
  ctaWrap: {
    marginTop: 'auto',
    paddingTop: 20,
  },
})
