import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { BrotMascot } from '@/components/brot'
import { usePressScale } from '@/hooks/use-press-scale'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import { formatPesos } from './onb-format'
import { OnbBody, OnbHeader, OnbHero, OnbProgress, OnbScreenShell } from './onb-kit'
import { ONB_SPEC, ONB_SURFACES, type OnbMode } from './onb-spec'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * 5e · Tu ahorro — réplica de screens/5e.html (claro) y 5eo.html
 * (oscuro). Copys y valores literales del mockup.
 *
 * El hero de 5e NO lleva Brot adentro (OnbHero con `brotPose={null}`)
 * y el CTA final es el verde propio de esta pantalla (distinto al CTA
 * del spec compartido de 5a) — por eso va local en vez de OnbCta.
 *
 * Monto calculado: monto = sueldo mensual × pct / 100. El demo de 5d
 * es $2.500.000/mes → al 10% da $250.000, exactamente el literal del
 * mockup ("Guardas $250.000 por mes sin pensarlo").
 */

/** Chips del mockup (0/5/10/20/30). 10% lleva el badge SUGERIDO. */
const CHIP_VALUES = [0, 5, 10, 20, 30] as const
const SUGGESTED_PCT = 10

/** Texto de error del rediseño: durazno de atención, NUNCA rojo. */
const ERROR_TEXT: Record<OnbMode, string> = { light: '#B0764A', dark: '#F2A87E' }

// ─── Valores propios de 5e/5eo (no están en ONB_SPEC) ────────────────

interface Onb5eSpec {
  /** Cards elevadas (panel % y globo de Brot). */
  cardGradientCss: string
  cardFallback: string
  cardShadow: string
  /** "% DEL SUELDO". */
  label: string
  /** Texto secundario del panel (chips idle, línea calculada, meta). */
  body: string
  /** Acento verde (monto, ícono +, ring del chip activo). */
  accent: string
  chipIdleBackground: string | undefined
  chipIdleShadow: string
  chipSelectedText: string
  chipSelectedBackground: string
  chipSelectedShadow: string
  badgeText: string
  badgeBackground: string
  /** Fila hundida "Agregar una meta". */
  metaBackground: string | undefined
  metaShadow: string
  metaOptional: string
  /** Globo de Brot. */
  bubbleText: string
  /** CTA verde propio de 5e. */
  ctaBackgroundCss: string
  ctaFallback: string
  ctaShadow: string
  ctaText: string
}

// Superficies compartidas (card/CTA/chips) vienen de ONB_SURFACES —
// strings byte-idénticos a los que este spec traía inline.
const SPEC_5E: Record<OnbMode, Onb5eSpec> = {
  light: {
    ...ONB_SURFACES.light,
    cardFallback: '#EBEDE0',
    label: '#54644F',
    body: '#3E5A44',
    accent: '#2E7C39',
    badgeText: '#F5F2E1',
    badgeBackground: '#2E7C39',
    metaBackground: undefined,
    metaShadow:
      'inset 4px 4px 9px rgba(151,160,136,0.35), inset -4px -4px 9px rgba(255,255,255,0.92)',
    metaOptional: '#9AA694',
    bubbleText: '#24382A',
    ctaFallback: '#48924E',
  },
  dark: {
    ...ONB_SURFACES.dark,
    cardFallback: '#1B3023',
    label: '#93A78F',
    body: '#B9CCB2',
    accent: '#A4E3A6',
    badgeText: '#0F1E14',
    badgeBackground: '#A4E3A6',
    metaBackground: '#142519',
    metaShadow: 'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.08)',
    metaOptional: '#7C917A',
    bubbleText: '#F1EEDD',
    ctaFallback: '#6EAC72',
  },
}

// ─── Pantalla ────────────────────────────────────────────────────────

export function Onb5eAhorro({
  mode,
  percent,
  monthlyIncome,
  onSelectPercent,
  onAddGoal,
  onBack,
  onNext,
  submitting = false,
  serverError = null,
}: {
  mode: OnbMode
  /** % de ahorro seleccionado (chips del mockup: 0/5/10/20/30). */
  percent: number
  /** Sueldo mensual (demo de 5d: 2.500.000) — base del monto calculado. */
  monthlyIncome: number
  onSelectPercent: (percent: number) => void
  /** "Agregar una meta" (colapsada en este mockup). */
  onAddGoal?: () => void
  onBack?: () => void
  onNext?: () => void
  /** Finish real en vuelo: CTA "Terminando…" con presses ignorados. */
  submitting?: boolean
  /** Error del finish (caller lo limpia al reintentar): failure state
   *  del rediseño (Brot worried + texto durazno) bajo el CTA. */
  serverError?: string | null
}) {
  const s = ONB_SPEC[mode]
  const d = SPEC_5E[mode]
  const { t } = useTranslation()

  return (
    <OnbScreenShell mode={mode}>
      <OnbBody>
        <OnbHeader mode={mode} title={t('onboarding:chrome.title.savings')} onBack={onBack} />
        {/* Último paso: los 5 segmentos van sólidos en el mockup. */}
        <OnbProgress mode={mode} active={4} />

        {/* Hero (sin Brot — solo partículas ×7, como el markup de 5e). */}
        <OnbHero
          mode={mode}
          title={t('onboarding:savingsStep.heroTitle')}
          subtitle={t('onboarding:savingsStep.heroSubtitle')}
          brotPose={null}
        />

        {/* Panel % del sueldo. */}
        <View
          style={[
            styles.card,
            {
              experimental_backgroundImage: d.cardGradientCss,
              backgroundColor: d.cardFallback,
              boxShadow: d.cardShadow,
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardLabel, { color: d.label }]}>
              {t('onboarding:savingsStep.percentEyebrow')}
            </Text>
            <Text style={[styles.cardValue, { color: s.text }]}>{percent}%</Text>
          </View>
          <View style={styles.chipsRow}>
            {CHIP_VALUES.map((value) => (
              <PercentChip
                key={value}
                mode={mode}
                value={value}
                selected={value === percent}
                suggested={value === SUGGESTED_PCT}
                onPress={() => onSelectPercent(value)}
              />
            ))}
          </View>
          <Text style={[styles.computedLine, { color: d.body }]}>
            {t('onboarding:savingsStep.computedPrefix')}
            <Text style={{ color: d.accent }}>
              {formatPesos((monthlyIncome * percent) / 100)}
            </Text>
            {t('onboarding:savingsStep.computedSuffix')}
          </Text>
        </View>

        {/* Fila hundida "Agregar una meta" (colapsada). */}
        <Pressable
          accessibilityRole="button"
          onPress={onAddGoal}
          style={[
            styles.metaRow,
            { backgroundColor: d.metaBackground, boxShadow: d.metaShadow },
          ]}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24">
            <Path
              d="M12 5.5v13M5.5 12h13"
              stroke={d.accent}
              strokeWidth={2.6}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
          <Text style={[styles.metaLabel, { color: d.body }]}>
            {t('onboarding:savingsStep.addGoal')}
          </Text>
          <Text style={[styles.metaOptional, { color: d.metaOptional }]}>
            {t('onboarding:savingsStep.optional')}
          </Text>
        </Pressable>

        {/* Brot + globo. */}
        <View style={styles.brotRow}>
          <BrotMascot pose="love" size={72} shadow={false} />
          <View
            style={[
              styles.bubble,
              {
                experimental_backgroundImage: d.cardGradientCss,
                backgroundColor: d.cardFallback,
                boxShadow: d.cardShadow,
              },
            ]}
          >
            <Text style={[styles.bubbleText, { color: d.bubbleText }]}>
              {t('onboarding:savingsStep.bubble')}
            </Text>
          </View>
        </View>

        {/* CTA verde propio de 5e (≠ CTA del spec compartido). */}
        <View style={styles.ctaBlock}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: submitting }}
            onPress={submitting ? undefined : onNext}
            style={[
              styles.cta,
              {
                experimental_backgroundImage: d.ctaBackgroundCss,
                backgroundColor: d.ctaFallback,
                boxShadow: d.ctaShadow,
              },
            ]}
          >
            <Text style={[styles.ctaLabel, { color: d.ctaText }]}>
              {submitting ? t('onboarding:cta.finishing') : t('onboarding:cta.finishAndStart')}
            </Text>
          </Pressable>
          {serverError ? (
            <Animated.View
              entering={FadeInDown.duration(motionDurations.standard)}
              style={styles.errorRow}
            >
              <BrotMascot pose="worried" size={34} shadow={false} />
              <Text style={[styles.errorText, { color: ERROR_TEXT[mode] }]}>
                {serverError}
              </Text>
            </Animated.View>
          ) : null}
          <Text style={[styles.ctaCaption, { color: s.helper }]}>
            {t('onboarding:savingsStep.ctaCaption')}
          </Text>
        </View>
      </OnbBody>
    </OnbScreenShell>
  )
}

// ─── Chip % (componente propio: hook de press scale por chip) ────────

function PercentChip({
  mode,
  value,
  selected,
  suggested,
  onPress,
}: {
  mode: OnbMode
  value: number
  selected: boolean
  suggested: boolean
  onPress: () => void
}) {
  const d = SPEC_5E[mode]
  const { t } = useTranslation()
  const pressScale = usePressScale({ pressedScale: 0.94 })

  const chip = (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={[
        styles.chip,
        selected
          ? {
              backgroundColor: d.chipSelectedBackground,
              boxShadow: d.chipSelectedShadow,
            }
          : {
              backgroundColor: d.chipIdleBackground,
              boxShadow: d.chipIdleShadow,
            },
        pressScale.animatedStyle,
      ]}
    >
      <Text
        style={[
          selected ? styles.chipTextSelected : styles.chipText,
          { color: selected ? d.chipSelectedText : d.body },
        ]}
      >
        {value}%
      </Text>
    </AnimatedPressable>
  )

  if (!suggested) return chip

  // Chip sugerido: el chip va dentro de un wrapper relativo (que toma el
  // flex 1.2 en la fila) y el badge se pinta como HERMANO POSTERIOR del
  // chip — por fuera de su caja. Así el ring/borde del chip (su boxShadow,
  // incl. el `0 0 0 2.5px` del estado activo) nunca cruza el badge: éste
  // queda íntegro por encima del borde superior, sin solaparse con la banda
  // del ring, y gana el orden de pintado con zIndex + elevation (Android).
  return (
    <View style={styles.chipSuggestedWrap}>
      {chip}
      <View pointerEvents="none" style={styles.badgeWrap}>
        <View style={[styles.badge, { backgroundColor: d.badgeBackground }]}>
          <Text style={[styles.badgeText, { color: d.badgeText }]}>
            {t('onboarding:savingsStep.badgeSuggested')}
          </Text>
        </View>
      </View>
    </View>
  )
}

// ─── Estilos (valores literales de 5e/5eo) ───────────────────────────

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    borderRadius: 26,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.61, // 0.14em × 11.5px
  },
  cardValue: {
    fontSize: 27,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    flex: 1,
    borderRadius: 15,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  // Wrapper del chip sugerido: toma el flex 1.2 en la fila (antes lo
  // llevaba el chip). El chip interior se estira a su ancho; el badge se
  // ancla a este wrapper como hermano posterior, fuera de la caja del chip.
  chipSuggestedWrap: {
    flex: 1.2,
    position: 'relative',
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  chipTextSelected: {
    fontSize: 12.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  badgeWrap: {
    // Anclado por su borde INFERIOR al borde superior del chip
    // (bottom:'100%'), el badge queda íntegro por ENCIMA del chip. El
    // paddingBottom lo despega de la banda del ring (`0 0 0 2.5px`) para
    // que el borde del chip nunca lo cruce. zIndex + elevation lo dejan al
    // frente en iOS y Android.
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 4,
    zIndex: 5,
    elevation: 5,
  },
  badge: {
    borderRadius: 7,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 7.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 0.6, // 0.08em × 7.5px
  },
  computedLine: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    marginTop: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    borderRadius: 22,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  metaLabel: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  metaOptional: {
    fontSize: 10.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.84, // 0.08em × 10.5px
  },
  brotRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  bubble: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  bubbleText: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    lineHeight: 18.125, // 12.5px × 1.45
  },
  ctaBlock: {
    marginTop: 'auto',
    paddingBottom: 16,
  },
  cta: {
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
  },
  ctaLabel: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 12,
  },
  errorText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  ctaCaption: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    marginTop: 10,
  },
})
