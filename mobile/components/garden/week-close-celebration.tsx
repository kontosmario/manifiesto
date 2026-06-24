import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { triggerHaptic } from '@/lib/haptics'
import { CardParticles } from '@/components/ui/card-particles'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { Sprout } from '@/components/garden/sprout'
import { CoralBloom } from '@/components/garden/coral-bloom'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionSprings } from '@/lib/motion'
import type { BroteStage, WeekClose } from '@/features/garden/garden-model'

interface WeekCloseCelebrationProps {
  weekClose: WeekClose
  onContinue: () => void
}

function labelColorForScore(score: number): string {
  if (score >= 7) return '#9FE08A'
  if (score >= 5) return '#B7DD8E'
  if (score >= 3) return '#CBD79F'
  if (score >= 1) return '#E0C58E'
  return '#A9A292'
}

function stageForDay(registered: boolean, weekStage: WeekClose['stage']): BroteStage {
  if (registered && weekStage !== 'none') return weekStage
  return 'missed'
}

/**
 * Celebración "Cierre de semana" (handoff Frame 4, familia HITO): takeover verde
 * con los 7 brotes de la semana que CRECEN escalonados (growIn) según el score
 * 0-7. Semana perfecta (7/7) → cada helecho con flor coral + confeti. Tap o
 * "Seguir cultivando" cierra. Se monta como overlay desde Mi jardín.
 */
export function WeekCloseCelebration({ weekClose, onContinue }: WeekCloseCelebrationProps) {
  const reduced = useReducedMotion()
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
        accessibilityLabel="Cerrar cierre de semana"
        onPress={onContinue}
        style={StyleSheet.absoluteFill}
      />
      <CardParticles count={14} color="#FFFBF2" accentColor="#F0B488" />
      {perfect && <ConfettiBurst pulseToken={1} originY={120} />}

      <Animated.View style={[styles.content, contentStyle]}>
        <Text style={[styles.eyebrow, { color: labelColor }]}>CIERRE DE SEMANA</Text>
        <Text style={styles.title}>{weekClose.title}</Text>
        <View style={styles.chip}>
          <Text style={[styles.chipLabel, { color: labelColor }]}>{weekClose.label}</Text>
          <View style={styles.chipDot} />
          <Text style={styles.chipCount}>{weekClose.score} de 7 días</Text>
        </View>

        {/* Fila de 7 brotes que crecen escalonados. */}
        <View style={styles.brotesRow}>
          {weekClose.days.map((day, i) => {
            const stage = stageForDay(day.registered, weekClose.stage)
            return (
              <View key={i} style={styles.broteCol}>
                <View style={styles.broteSlot}>
                  <Sprout
                    stage={stage}
                    fernSize={40}
                    tone="dark"
                    animateIn
                    animateInDelay={i * 70}
                  />
                  {perfect && day.registered && (
                    <CoralBloom size={9} color="#E2935E" left="24%" top="6%" durationMs={11000} />
                  )}
                </View>
                <Text
                  style={[
                    styles.broteLetter,
                    { color: day.registered ? '#9FE08A' : '#8CA285' },
                  ]}
                >
                  {day.letter}
                </Text>
              </View>
            )
          })}
        </View>

        <Text style={styles.sub}>{weekClose.sub}</Text>

        <Pressable onPress={onContinue} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>Seguir cultivando</Text>
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
    backgroundColor: '#163A1E',
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
    letterSpacing: 2.2,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.6,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 33,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 12,
  },
  chipLabel: { fontSize: 13, fontWeight: '800' },
  chipDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  chipCount: { fontSize: 13, fontWeight: '700', color: '#C4D6BC' },
  brotesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 30,
  },
  broteCol: { alignItems: 'center', gap: 10, flex: 1 },
  broteSlot: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  broteLetter: { fontSize: 11, fontWeight: '700' },
  sub: {
    fontSize: 14,
    lineHeight: 21,
    color: '#A9C2A1',
    textAlign: 'center',
    marginTop: 22,
  },
  button: {
    width: '100%',
    height: 54,
    borderRadius: 18,
    backgroundColor: '#9FE08A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  buttonText: { fontSize: 16, fontWeight: '800', color: '#163A1E' },
})
