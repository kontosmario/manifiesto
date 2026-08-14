import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { usePressScale } from '@/hooks/use-press-scale'
import { nunitoFamily } from '@/theme/typography'
import { formatPesos } from '../onb-format'
import { ONB_MONTO_EDITING } from '../onb-numpad'
import { ONB_SPEC, type OnbMode } from '../onb-spec'
import { ONB_5D_SPEC } from './onb-5d-spec'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * 5d · card de monto (display grande tap-to-edit) y stepper del ciclo
 * custom ("cada N días", 1–90).
 */

// ─── Card de monto ───────────────────────────────────────────────────

/**
 * Display del monto: card read-only tocable. El tap abre el numpad
 * (4j/4jo) — el estado `numpadOpen` vive en la screen. Mientras el
 * numpad está abierto (`editing`) la card toma el tratamiento elevado
 * de ONB_MONTO_EDITING (anillo verde 3px + elevación, top de 4j) y
 * oculta el hint "Tap para editar". El caret (barra verde) marca la
 * caja como editable. Ya no hay TextInput ni teclado del OS.
 */
export function Onb5dMontoCard({
  mode,
  kicker,
  monto,
  editing,
  onOpen,
}: {
  mode: OnbMode
  kicker: string
  monto: number
  /** El numpad está abierto sobre esta card. */
  editing: boolean
  /** Abrir el numpad (lo monta la screen como overlay). */
  onOpen: () => void
}) {
  const d = ONB_5D_SPEC[mode]
  const edit = ONB_MONTO_EDITING[mode]
  const { t } = useTranslation()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={kicker}
      onPress={onOpen}
      style={[
        styles.montoCard,
        editing
          ? { backgroundColor: edit.background, boxShadow: edit.shadow }
          : {
              experimental_backgroundImage: d.cardGradientCss,
              backgroundColor: d.cardFallback,
              boxShadow: d.cardShadowStrong,
            },
      ]}
    >
      <View style={styles.montoHeaderRow}>
        <Text style={[styles.montoKicker, { color: d.montoKicker }]}>{kicker}</Text>
        {editing ? null : (
          <Text style={[styles.montoEdit, { color: d.montoEdit }]}>
            {t('onboarding:redesign.ingresos.tapToEdit')}
          </Text>
        )}
      </View>
      <View style={styles.montoAmountRow}>
        <Text style={[styles.montoAmount, { color: d.montoAmount }]}>{formatPesos(monto)}</Text>
        <View style={[styles.montoCaret, { backgroundColor: d.montoEdit }]} />
      </View>
    </Pressable>
  )
}

// ─── Stepper del ciclo custom ────────────────────────────────────────

export function Onb5dStepper({
  mode,
  value,
  onChange,
}: {
  mode: OnbMode
  /** Cada N días, 1–90 (clamp local). */
  value: number
  onChange: (value: number) => void
}) {
  const s = ONB_SPEC[mode]
  const d = ONB_5D_SPEC[mode]
  const { t } = useTranslation()
  const minusScale = usePressScale({ pressedScale: 0.94 })
  const plusScale = usePressScale({ pressedScale: 0.94 })
  return (
    <>
      <View
        style={[
          styles.stepperCard,
          {
            experimental_backgroundImage: d.cardGradientCss,
            backgroundColor: d.cardFallback,
            boxShadow: d.cardShadowSoft,
          },
        ]}
      >
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => onChange(Math.max(1, value - 1))}
          onPressIn={minusScale.onPressIn}
          onPressOut={minusScale.onPressOut}
          style={[
            styles.stepperCircle,
            {
              experimental_backgroundImage: d.stepperMinusGradientCss,
              backgroundColor: d.stepperMinusFallback,
              boxShadow: d.stepperMinusShadow,
            },
            minusScale.animatedStyle,
          ]}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
              d="M5.5 12h13"
              stroke={d.stepperMinusIcon}
              strokeWidth={2.8}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </AnimatedPressable>
        <View style={styles.stepperValueCol}>
          <Text style={[styles.stepperValue, { color: d.stepperValue }]}>{value}</Text>
          <Text style={[styles.stepperUnit, { color: d.stepperUnit }]}>
            {t('onboarding:redesign.ingresos.stepperUnit')}
          </Text>
        </View>
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => onChange(Math.min(90, value + 1))}
          onPressIn={plusScale.onPressIn}
          onPressOut={plusScale.onPressOut}
          style={[
            styles.stepperCircle,
            {
              experimental_backgroundImage: d.accentRadialCss,
              backgroundColor: d.accentRadialFallback,
              boxShadow: d.stepperPlusShadow,
            },
            plusScale.animatedStyle,
          ]}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
              d="M12 5.5v13M5.5 12h13"
              stroke={d.stepperPlusIcon}
              strokeWidth={2.8}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </AnimatedPressable>
      </View>
      <Text style={[styles.stepperHelper, { color: s.helper }]}>
        {t('onboarding:redesign.ingresos.stepperHelper')}
      </Text>
    </>
  )
}

// ─── Estilos (valores literales de 5d…5d5) ───────────────────────────

const styles = StyleSheet.create({
  montoCard: {
    marginTop: 10,
    borderRadius: 26,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  montoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  montoKicker: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.61, // 0.14em × 11.5px
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
    letterSpacing: -0.72, // -0.02em × 36px
  },
  montoCaret: {
    // Caret del mockup 4j: barra verde fina a la derecha del monto.
    width: 3,
    height: 30,
    borderRadius: 2,
    opacity: 0.7,
  },
  stepperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 10,
    borderRadius: 24,
    padding: 14,
  },
  stepperCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValueCol: {
    alignItems: 'center',
    minWidth: 96,
  },
  stepperValue: {
    fontSize: 38,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    lineHeight: 38, // line-height:1
  },
  stepperUnit: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    marginTop: 2,
  },
  stepperHelper: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    marginTop: 8,
  },
})
