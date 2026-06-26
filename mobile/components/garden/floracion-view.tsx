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
import { CardParticles } from '@/components/ui/card-particles'
import { AuroraBloom } from '@/components/ui/aurora-bloom'
import { FernMark } from '@/components/billing/fern-mark'
import { CoralBloom } from '@/components/garden/coral-bloom'
import {
  AchievementIcon,
  hasAchievementIcon,
  ICON_CORAL,
  ICON_CORAL_SOFT,
  ICON_FOREST,
} from '@/components/achievements/achievement-icon'
import {
  FilledAchievementIcon,
  hasFilledAchievementIcon,
} from '@/components/achievements/achievement-icon-filled'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionSprings } from '@/lib/motion'
import { floracionToneForTier } from '@/features/garden/garden-tier'
import type { AchievementViewItem } from '@/features/achievements/use-achievements'

interface FloracionViewProps {
  /** Logro a celebrar. `null` mantiene la celebración oculta. */
  item: AchievementViewItem | null
  onDismiss: () => void
}

/**
 * Celebración de hito "Floración". Reemplaza al AchievementUnlockModal feo por
 * un takeover verde full-screen (familia del handoff Frame 3): luciérnagas +
 * helecho de marca con glow + flores coral que laten. La intensidad escala con
 * el tier del logro. Tap en cualquier lado o "Seguir cultivando" cierra;
 * auto-cierra a los 6s. Se monta en el AchievementUnlockBridge (overlay
 * absoluto sobre todo, no es un RN Modal).
 */
export function FloracionView({ item, onDismiss }: FloracionViewProps) {
  const reduced = useReducedMotion()
  const { t: translate } = useTranslation()
  const t = useSharedValue(0)
  const pop = useSharedValue(0.9)

  useEffect(() => {
    if (!item) return
    void triggerHaptic('success')
    if (reduced) {
      t.value = 1
      pop.value = 1
      return
    }
    t.value = 0
    pop.value = 0.9
    // @motion-allow: 420ms entrada del takeover de celebración (ease-out-expo).
    t.value = withTiming(1, { duration: 420, easing: Easing.bezier(0.16, 1, 0.3, 1) })
    pop.value = withDelay(120, withSpring(1, motionSprings.celebrate))
  }, [item, reduced, t, pop])

  useEffect(() => {
    if (!item) return
    const id = setTimeout(onDismiss, 6000)
    return () => clearTimeout(id)
  }, [item, onDismiss])

  const scrimStyle = useAnimatedStyle(() => ({ opacity: t.value }))
  const contentStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (1 - t.value) * 18 }, { scale: pop.value }],
  }))

  if (!item) return null
  const tone = floracionToneForTier(item.tier)

  return (
    <Animated.View pointerEvents="auto" style={[styles.scrim, scrimStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={translate('achievements:floracion.closeLabel')}
        onPress={onDismiss}
        style={StyleSheet.absoluteFill}
      />
      {/* Luciérnagas (crema + coral), cantidad según tier. */}
      <CardParticles count={tone.particleCount} color="#FFFBF2" accentColor="#F0B488" />

      <Animated.View style={[styles.content, contentStyle]}>
        <View style={styles.fernWrap}>
          <AuroraBloom color="#2E6B34" size={210} intensity={0.5} />
          {/* El ícono ÚNICO del hito en una medalla crema → cada celebración se
              siente distinta. Antes era el FernMark genérico (todas iguales por
              tier). Fallback al helecho para codes sin ícono custom. */}
          {hasFilledAchievementIcon(item.code) ? (
            <View style={styles.medallion}>
              <FilledAchievementIcon code={item.code} size={118} />
            </View>
          ) : hasAchievementIcon(item.code) ? (
            <View style={styles.medallion}>
              <AchievementIcon
                code={item.code}
                size={80}
                stroke={ICON_FOREST}
                accent={ICON_CORAL}
                accentSoft={ICON_CORAL_SOFT}
              />
            </View>
          ) : (
            <FernMark variant="cream" size={150} />
          )}
          {tone.blooms >= 1 && (
            <CoralBloom size={13} color="#E2935E" left="30%" top="24%" durationMs={11000} />
          )}
          {tone.blooms >= 2 && (
            <CoralBloom
              size={11}
              color="#F0B488"
              glow="0 0 10px 2px rgba(240,180,136,0.5)"
              left="62%"
              top="18%"
              durationMs={13500}
            />
          )}
        </View>

        <Text style={styles.eyebrow}>{translate('achievements:floracion.eyebrow')}</Text>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>

        <View style={styles.chip}>
          <FernMark variant="mint" size={16} />
          <Text style={[styles.chipText, { color: tone.accent }]}>
            {translate(`achievements:floracion.tier.${item.tier}`)}
          </Text>
        </View>

        <Pressable onPress={onDismiss} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>{translate('achievements:floracion.continue')}</Text>
        </Pressable>
        <Text style={styles.hint}>{translate('achievements:floracion.hint')}</Text>
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
    maxWidth: 340,
    alignItems: 'center',
  },
  fernWrap: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    position: 'relative',
  },
  medallion: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: '#FFFBF2',
    borderWidth: 3,
    borderColor: 'rgba(240,180,136,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    // El ícono relleno trae su fondo forest cuadrado → clip a círculo.
    overflow: 'hidden',
    // Glow cálido sobre el scrim verde (la aurora aporta el verde detrás).
    shadowColor: '#F0B488',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  eyebrow: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 2.2,
    color: '#9FCB93',
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.6,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 33,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: '#A9C2A1',
    textAlign: 'center',
    marginTop: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(159,224,138,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(159,224,138,0.3)',
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 20,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  button: {
    width: '100%',
    height: 56,
    borderRadius: 18,
    backgroundColor: '#9FE08A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#163A1E',
  },
  hint: {
    fontSize: 12.5,
    color: '#9FCB93', // AA sobre el scrim #163A1E (6.9:1; antes #7E9579 = 3.9)
    textAlign: 'center',
    marginTop: 14,
  },
})
