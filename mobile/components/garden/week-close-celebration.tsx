import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { triggerHaptic } from '@/lib/haptics'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { Sprout } from '@/components/garden/sprout'
import { BroteFireflies } from '@/components/garden/brote-fireflies'
import { CardParticles } from '@/components/ui/card-particles'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionSprings } from '@/lib/motion'
import { cssGradient, neoParticlePresets, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import type { BroteStage, WeekClose } from '@/features/garden/garden-model'

interface WeekCloseCelebrationProps {
  weekClose: WeekClose
  onContinue: () => void
}

/**
 * Paleta ANCLADA a la rama OSCURA del rediseño, no a `useThemeTokens()`.
 *
 * La celebración es un TAKEOVER a pantalla completa que se auto-dispara
 * sobre cualquier tab (`WeekCloseBridge` vive fuera del Stack), y siempre
 * fue deliberadamente oscura en los dos temas. Resolver los tokens con el
 * modo del usuario la convertiría en claro en un lavado verde pálido —y
 * además rompe el contraste: sobre el hero CLARO (stop medio `#4C9A52`)
 * los niveles de texto del sistema caen por debajo de AA. Anclar a
 * `dark` preserva el momento Y el contraste (todas las tintas de abajo
 * miden ≥ 4.5:1 contra el stop del gradiente donde cae el texto).
 *
 * Como el modo es constante, los tokens se resuelven a nivel de módulo y
 * los estilos siguen siendo un `StyleSheet.create` estático.
 */
const neo = neoTokens('dark')

/** Preset de partículas que el handoff definió para ESTA pantalla. */
const WEEK_CLOSE_PARTICLES = neoParticlePresets.weekCloseLight

/** CTA primario del rediseño: radial `circle at 32% 28%` + sombra `cta`. */
const CTA_GRADIENT_CSS = `radial-gradient(circle at 32% 28%, ${neo.ctaGradient[0]}, ${neo.ctaGradient[1]} 85%)`

/**
 * Qué tan buena fue la semana, en la escala del rediseño. Es INFORMACIÓN
 * (no decoración): la V1 tenía 5 tramos sobre un degradé verde→oliva→arena
 * que no existe en neo, cuya paleta sólo tiene verde / cálido / 4 niveles
 * de texto. Se conservan los escalones colapsando a 4 tramos —el
 * neutro y el olivo de la V1 caían en el mismo token— manteniendo la
 * misma lectura: verde = buena, cálido = floja, gris = vacía.
 *
 * Contraste sobre el stop del hero donde cae el texto (`#1B3A26`):
 * green 8.3:1 · heroLabel 5.8:1 · warm 6.3:1 · textMuted 4.8:1.
 * `textTertiary` (el nivel 4) queda fuera: da 3.7:1.
 */
function labelColorForScore(score: number): string {
  if (score >= 7) return neo.green
  if (score >= 5) return neo.heroLabel
  if (score >= 1) return neo.warm
  return neo.textMuted
}

function stageForDay(
  registered: boolean,
  recovered: boolean,
  weekStage: WeekClose['stage'],
): BroteStage {
  if (registered && weekStage !== 'none') return weekStage
  // Día que un escudo recuperó: brote coral 'recovered' (no florece, pero
  // tampoco se muestra marchito como un salteado real).
  if (recovered) return 'recovered'
  return 'missed'
}

/**
 * Celebración "Cierre de semana" (handoff Frame 4, familia HITO): takeover
 * sobre el hero verde del rediseño con los 7 brotes de la semana que CRECEN
 * escalonados (growIn) según el score 0-7. Semana perfecta (7/7) → cada
 * helecho con flor coral + confeti. Tap o "Seguir cultivando" cierra. Se
 * monta como overlay desde Mi jardín.
 */
export function WeekCloseCelebration({ weekClose, onContinue }: WeekCloseCelebrationProps) {
  const reduced = useReducedMotion()
  const { t: translate } = useTranslation()
  const t = useSharedValue(0)
  const pop = useSharedValue(0.94)
  const perfect = weekClose.score >= 7
  const labelColor = labelColorForScore(weekClose.score)

  useEffect(() => {
    void triggerHaptic(perfect ? 'success' : 'selection')
    if (reduced) {
      t.value = 1
      pop.value = 1
      return
    }
    t.value = withTiming(1, { duration: 420, easing: Easing.bezier(0.16, 1, 0.3, 1) })
    pop.value = withDelay(100, withSpring(1, motionSprings.celebrate))
  }, [reduced, perfect, t, pop])

  const scrimStyle = useAnimatedStyle(() => ({ opacity: t.value }))
  const contentStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (1 - t.value) * 16 }, { scale: pop.value }],
  }))

  return (
    <Animated.View pointerEvents="auto" style={[styles.scrim, scrimStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={translate('garden:weekCloseCelebration.closeLabel')}
        onPress={onContinue}
        style={StyleSheet.absoluteFill}
      />
      {/* Campo de luciérnagas AMBIENTE (atmósfera) — siempre presente, además de
          las órbitas por-brote. Es hijo del scrim → hereda su fade-in (no popea
          estático) y las peach ya driftean más con el boost global.
          Colores + cantidad del preset `weekCloseLight`, que el handoff creó
          justamente para esta pantalla. */}
      <CardParticles
        count={WEEK_CLOSE_PARTICLES.count}
        color={WEEK_CLOSE_PARTICLES.colors[2]}
        accentColor={WEEK_CLOSE_PARTICLES.colors[0]}
        peachColor={WEEK_CLOSE_PARTICLES.colors[1]}
      />
      {perfect && (
        <ConfettiBurst pulseToken={1} originY={120} colors={WEEK_CLOSE_PARTICLES.colors} />
      )}

      <Animated.View style={[styles.content, contentStyle]}>
        <Text style={[styles.eyebrow, { color: labelColor }]}>
          {translate('garden:weekCloseCelebration.eyebrow')}
        </Text>
        <Text style={styles.title}>{weekClose.title}</Text>
        <View style={styles.chip}>
          <Text style={[styles.chipLabel, { color: labelColor }]}>{weekClose.label}</Text>
          <View style={styles.chipDot} />
          <Text style={styles.chipCount}>
            {translate('garden:weekCloseCelebration.count', { score: weekClose.score })}
          </Text>
        </View>

        {/* Zona de brotes — las luciérnagas protagonistas viven ACÁ, cerca de
            los brotes (no dispersas por la pantalla). En este contenedor chico
            la misma amplitud de drift se percibe MUCHO más grande. */}
        <View style={styles.brotesZone}>
          <View style={styles.brotesRow}>
          {weekClose.days.map((day, i) => {
            const stage = stageForDay(day.registered, day.recovered, weekClose.stage)
            return (
              <View key={i} style={styles.broteCol}>
                <View style={styles.broteSlot}>
                  <Sprout
                    stage={stage}
                    fernSize={46}
                    tone="dark"
                    animateIn
                    animateInDelay={i * 70}
                  />
                  {/* Luciérnagas que ORBITAN este brote (entran escalonadas con
                      su growIn + rodean el fern de forma dinámica). */}
                  {day.registered && <BroteFireflies delay={i * 70 + 240} />}
                </View>
                <Text
                  style={[
                    styles.broteLetter,
                    // Semántica del día, no decoración: registrado = verde de
                    // acción · recuperado por escudo = cálido de alerta ·
                    // salteado = texto apagado. El nivel 4 (`textTertiary`)
                    // daría 3.7:1 sobre el hero, así que el salteado usa el
                    // nivel 3.
                    {
                      color: day.registered
                        ? neo.green
                        : day.recovered
                          ? neo.warm
                          : neo.textMuted,
                    },
                  ]}
                >
                  {day.letter}
                </Text>
              </View>
            )
          })}
          </View>
        </View>

        <Text style={styles.sub}>{weekClose.sub}</Text>

        <Pressable onPress={onContinue} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>
            {translate('garden:weekCloseCelebration.continue')}
          </Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Fondo de takeover del rediseño: el hero verde oscuro de 3 stops
    // (150deg #234931 / #1B3A26 / #16301F), con el stop medio de fallback
    // si el gradiente CSS no está soportado.
    ...cssGradient(neo.heroGradientCss, neo.heroGradient[1]),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    paddingHorizontal: 30,
    overflow: 'hidden',
  },
  content: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 2.2,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.6,
    color: neo.text,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 33,
  },
  // Chip = pozo hundido del vocabulario neo (fill `well` + sombra inset),
  // no un blanco translúcido. Tiene fill propio contra el hero, así que en
  // Android < API 29 —donde el inset se descarta en silencio— sigue
  // leyéndose como una placa.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: neo.well,
    boxShadow: neo.shadows.insetSm,
    borderRadius: neoRadii.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 12,
  },
  chipLabel: { fontSize: 13, fontWeight: '800', fontFamily: nunitoFamily('800') },
  chipDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: neo.textTertiary },
  chipCount: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    color: neo.textMuted,
  },
  // Zona que contiene la fila de brotes + el cluster de luciérnagas. El
  // paddingTop da el espacio donde las luciérnagas "flotan" sobre los brotes.
  brotesZone: {
    alignSelf: 'stretch',
    marginTop: 14,
    paddingTop: 22,
    position: 'relative',
  },
  brotesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  broteCol: { alignItems: 'center', gap: 10, flex: 1 },
  broteSlot: {
    // 50 → 58 para alojar los brotes más grandes (fernSize 46 + stickers).
    height: 58,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  broteLetter: { fontSize: 11, fontWeight: '700', fontFamily: nunitoFamily('700') },
  sub: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: nunitoFamily('400'),
    color: neo.textMuted,
    textAlign: 'center',
    marginTop: 22,
  },
  button: {
    width: '100%',
    height: 54,
    borderRadius: neoRadii.input,
    ...cssGradient(CTA_GRADIENT_CSS, neo.ctaGradient[1]),
    boxShadow: neo.shadows.cta,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    color: neo.ctaText,
  },
})
