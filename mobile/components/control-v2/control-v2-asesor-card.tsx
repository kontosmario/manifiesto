import { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
// Aliased import: the Asesor card's loops are decorative (halos,
// breath, shimmer) and must NOT pause on blur. Switch from
// focus-gated `useLoopAnimation` to `useUnboundedLoopAnimation`.
// See ui/card-particles.tsx for the same fix in the Home hero.
import { useUnboundedLoopAnimation as useLoopAnimation } from '@/hooks/use-unbounded-loop-animation'
import { usePressScale } from '@/hooks/use-press-scale'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { formatMoneyShort } from '@/utils/money'
import { useDismissedIds } from '@/features/insights/control-dismiss-store'
import {
  TYPE_TONES,
  bubbleHeadline,
  bubbleIntro,
  bubbleType,
} from './asesor-bubble-meta'
import { iconForSignal } from './asesor-signal-meta'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import { decorativeDurations, motionEasings } from '@/lib/motion/tokens'

interface ControlV2AsesorCardProps {
  tareas: ControlAdvisorTask[]
}

// ─── Tokens ───────────────────────────────────────────────────────────────

// V1 Mint Saturado — asesor card chrome on the dark forest shell.
const SHELL_GRADIENT = ['#12211A', '#244235'] as const  // surface-950 → surface-900
const STAR_COLOR = '#A6EF8F'                             // primary-300
const ASSISTANT_GRADIENT = ['#A6EF8F', '#329315'] as const  // primary-300 → primary-700
const STATUS_DOT = '#49D61F'                             // primary-500
const TEXT_ACCENT = '#A6EF8F'                            // primary-300
const TEXT_SECONDARY = 'rgba(242,234,211,0.70)'          // cream alpha
const TEXT_TERTIARY = 'rgba(166,239,143,0.55)'           // primary-300 alpha
const HAIRLINE = 'rgba(166,239,143,0.12)'                // primary-300 alpha
const STRIP_BG = 'rgba(0,0,0,0.18)'
const COUNT_PILL_BG = 'rgba(166,239,143,0.15)'
const COUNT_PILL_BORDER = 'rgba(166,239,143,0.22)'
const BUBBLE_BG = '#FFFBF2'                              // creamCard light
const BUBBLE_TEXT = '#12211A'                            // surface-950 (AAA on cream bubble)
const BUBBLE_BODY = '#3B6D57'                            // surface-700 (textMuted V1)

/**
 * Asistente Financiero — compact "Home card" entry point.
 *
 * Visual: dark forest panel with a twinkling-stars ambient background,
 * a chat-style lead bubble for the most urgent signal, and a small
 * constellation strip that previews the rest. Tapping anywhere opens
 * the full conversation screen (`/asistente`).
 *
 * The ALL-cards grid + per-row swipe + per-row CTA pattern lives now
 * in the dedicated chat screen. From Control we only show the teaser.
 */
export function ControlV2AsesorCard({
  tareas,
}: ControlV2AsesorCardProps) {
  const dismissed = useDismissedIds()
  const router = useRouter()
  const visible = tareas.filter(
    (t) =>
      !dismissed.has(
        t.action?.kind === 'dismiss' ? t.action.dismissId : t.id,
      ),
  )
  const totalImpact = visible.reduce((s, t) => s + t.impactRaw, 0)
  const renderNothing = tareas.length === 0
  const allDismissed = !renderNothing && visible.length === 0
  const formatHero = useCallback((n: number) => formatMoneyShort(n), [])

  const openChat = useCallback(() => {
    void triggerHaptic('selection')
    router.push('/(app)/asistente' as never)
  }, [router])
  // Press scale subtle 0.98 — el asesor card es grande (full-width
  // gradient shell con TwinklingStars). Escala chica para que la
  // sensación de tap sea perceptible sin competir con el shimmer.
  const cardPress = usePressScale({ pressedScale: 0.98 })

  if (renderNothing) return null

  // Lead = most urgent. We reuse the ranking already done by the
  // signal builder (signals come pre-sorted by score). The first
  // visible task is the highest priority right now.
  const lead = visible[0]
  const ideaCount = visible.length

  return (
    <RiseView delay={260} style={styles.outer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir asistente, ${ideaCount} ${ideaCount === 1 ? 'sugerencia' : 'sugerencias'}`}
        onPress={openChat}
        onPressIn={cardPress.onPressIn}
        onPressOut={cardPress.onPressOut}
      >
        <Animated.View style={cardPress.animatedStyle}>
        <LinearGradient
          colors={SHELL_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.shell}
        >
          <TwinklingStars count={14} />

          <View style={styles.header}>
            <AssistantAvatar size={34} dotSize={10} />
            <View style={styles.headerText}>
              <Text style={styles.brandLabel}>ASISTENTE</Text>
              <Text style={styles.headerSub}>
                {allDismissed
                  ? 'Al día por ahora'
                  : `${ideaCount} ${ideaCount === 1 ? 'cosa' : 'cosas'} para ti`}
              </Text>
            </View>
            {!allDismissed ? (
              <View style={styles.impactPill}>
                <Text style={styles.impactPillSign}>+</Text>
                <CountUpText
                  value={totalImpact}
                  duration={1400}
                  format={formatHero}
                  style={styles.impactPillValue}
                  accessibilityLabel={`Impacto total ${formatMoneyShort(totalImpact)} por mes`}
                />
              </View>
            ) : (
              <View style={[styles.impactPill, styles.impactPillDone]}>
                <MaterialIcons name="check" size={12} color={STATUS_DOT} />
              </View>
            )}
          </View>

          {allDismissed ? (
            <EmptyLeadBubble />
          ) : (
            <LeadBubble task={lead!} />
          )}

          <ConstellationStrip
            signals={visible}
            allDismissed={allDismissed}
            onOpen={openChat}
          />
        </LinearGradient>
        </Animated.View>
      </Pressable>
    </RiseView>
  )
}

// ─── Assistant Avatar ─────────────────────────────────────────────────────

function AssistantAvatar({ size, dotSize }: { size: number; dotSize: number }) {
  const reduced = useReducedMotion()
  const pulse = useSharedValue(0)
  useLoopAnimation(
    () => {
      if (reduced) return
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: decorativeDurations.pulse, easing: motionEasings.decelerate }),
          withTiming(0, { duration: decorativeDurations.pulse, easing: motionEasings.decelerate }),
        ),
        -1,
        false,
      )
    },
    [pulse],
    [reduced],
  )
  const aRing = useAnimatedStyle(() => ({
    opacity: 0.55 - pulse.value * 0.55,
    transform: [{ scale: 1 + pulse.value * 0.6 }],
  }))
  return (
    <View style={{ width: size + 4, height: size + 4 }}>
      <LinearGradient
        colors={ASSISTANT_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <MaterialIcons name="auto-awesome" size={size * 0.5} color="#12211A" />
      </LinearGradient>
      <Animated.View
        style={[
          styles.avatarDot,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: STATUS_DOT,
            right: -1,
            bottom: -1,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.avatarDotRing,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            borderColor: STATUS_DOT,
            right: -1,
            bottom: -1,
          },
          aRing,
        ]}
        pointerEvents="none"
      />
    </View>
  )
}

// ─── Twinkling Stars ──────────────────────────────────────────────────────

function TwinklingStars({ count }: { count: number }) {
  // Deterministic positions so we don't re-randomize on each render.
  // 14 stars is enough to read as "ambient" without compositor cost.
  const reduced = useReducedMotion()
  const phase = useSharedValue(0)
  useLoopAnimation(
    () => {
      if (reduced) return
      phase.value = withRepeat(
        withSequence(
          withTiming(1, { duration: decorativeDurations.pulseSlow, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: decorativeDurations.pulseSlow, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      )
    },
    [phase],
    [reduced],
  )
  return (
    <View style={styles.starsLayer} pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => {
        const left = ((i * 73 + 7) % 100) / 100
        const top = ((i * 41 + 11) % 100) / 100
        const baseOpacity = 0.25 + (i % 4) * 0.08
        const delay = (i % 6) * 0.16
        return (
          <TwinkleStar
            key={i}
            left={left}
            top={top}
            baseOpacity={baseOpacity}
            phaseOffset={delay}
            phase={phase}
          />
        )
      })}
    </View>
  )
}

function TwinkleStar({
  left,
  top,
  baseOpacity,
  phaseOffset,
  phase,
}: {
  left: number
  top: number
  baseOpacity: number
  phaseOffset: number
  phase: { value: number }
}) {
  const a = useAnimatedStyle(() => {
    // Each star has a slight phase offset so they twinkle out-of-sync.
    const v = (phase.value + phaseOffset) % 1
    const wave = Math.sin(v * Math.PI)
    return { opacity: baseOpacity + wave * 0.35 }
  })
  return (
    <Animated.View
      style={[
        styles.star,
        {
          left: `${left * 100}%`,
          top: `${top * 100}%`,
          backgroundColor: STAR_COLOR,
        },
        a,
      ]}
    />
  )
}

// ─── Lead Bubble ──────────────────────────────────────────────────────────

function LeadBubble({ task }: { task: ControlAdvisorTask }) {
  const type = bubbleType(task)
  const tone = TYPE_TONES[type]
  const isCritical = task.urgency === 'alta'
  const intro = bubbleIntro(task)
  const headline = bubbleHeadline(task)
  const icon = iconForSignal(task.id)

  return (
    <View style={styles.leadWrap}>
      <Text style={styles.leadIntro}>
        {intro} · ahora
      </Text>
      <View
        style={[
          styles.leadBubble,
          {
            borderColor: tone.accent,
            shadowColor: tone.accent,
          },
        ]}
      >
        <View style={styles.bubbleTop}>
          <View
            style={[
              styles.bubbleIconTile,
              { backgroundColor: tone.bg },
            ]}
          >
            <MaterialIcons name={icon} size={13} color={tone.fg} />
          </View>
          <Text
            style={[styles.bubbleHeadline, { color: tone.fg }]}
            numberOfLines={1}
          >
            {headline.toUpperCase()}
          </Text>
          {isCritical ? (
            <View
              style={[styles.urgentBadge, { backgroundColor: tone.fg }]}
            >
              <Text style={styles.urgentBadgeText}>URGENTE</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.bubbleTitle} numberOfLines={2}>
          {task.title}
        </Text>
      </View>
    </View>
  )
}

function EmptyLeadBubble() {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.leadWrap}>
      <Text style={styles.leadIntro}>✓ Por ahora · sin novedades</Text>
      <View
        style={[
          styles.leadBubble,
          {
            borderColor: 'rgba(199,238,156,0.35)',
            shadowOpacity: 0,
          },
        ]}
      >
        <Text style={styles.bubbleTitle} numberOfLines={2}>
          Revisaste todas las sugerencias.
        </Text>
        <Text style={styles.bubbleBody}>
          Volverán a aparecer si los patrones persisten.
        </Text>
      </View>
    </Animated.View>
  )
}

// ─── Constellation Strip ──────────────────────────────────────────────────

function ConstellationStrip({
  signals,
  allDismissed,
  onOpen,
}: {
  signals: ControlAdvisorTask[]
  allDismissed: boolean
  onOpen: () => void
}) {
  const overflow = Math.max(0, signals.length - 1)

  return (
    <View style={styles.strip}>
      <View style={styles.stripHeader}>
        <Text style={styles.stripEyebrow}>
          {allDismissed
            ? 'Esperando nuevas señales'
            : overflow > 0
              ? `Y +${overflow} ${overflow === 1 ? 'señal más' : 'señales más'}`
              : 'Abrir chat completo'}
        </Text>
        <Pressable onPress={onOpen} hitSlop={8} style={styles.openCta}>
          <Text style={styles.openCtaText}>Abrir chat</Text>
          <MaterialIcons name="arrow-outward" size={12} color={TEXT_ACCENT} />
        </Pressable>
      </View>
      <View style={styles.stripStars}>
        {signals.length > 0 ? (
          signals.map((s, i) => (
            <SignalStar key={s.id} task={s} index={i} />
          ))
        ) : (
          <Text style={styles.stripEmpty}>·  ·  ·</Text>
        )}
        <View style={styles.stripDots}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.stripDot} />
          ))}
        </View>
      </View>
    </View>
  )
}

function SignalStar({ task, index }: { task: ControlAdvisorTask; index: number }) {
  const type = bubbleType(task)
  const tone = TYPE_TONES[type]
  const isCritical = task.urgency === 'alta'
  // Star size by impact magnitude — communicates which signal carries
  // the most weight without explanatory copy.
  const size = 22 + (task.impactRaw > 100_000 ? 10 : task.impactRaw > 10_000 ? 4 : 0)
  const icon = iconForSignal(task.id)

  // Pulse ring for critical signals. Each star pulses with its own
  // phase offset so they don't blink in unison.
  const reduced = useReducedMotion()
  const ring = useSharedValue(0)
  useLoopAnimation(
    () => {
      if (reduced || !isCritical) return
      ring.value = withDelay(
        index * 200,
        withRepeat(
          withSequence(
            // @motion-allow: 2000ms critical signal sonar pulse — between halo (1800) and pulseSlow (2400) by design
            withTiming(1, { duration: 2000, easing: motionEasings.decelerate }),
            // @motion-allow: instant 0ms reset of the sonar ring at end of each cycle
            withTiming(0, { duration: 0 }),
          ),
          -1,
          false,
        ),
      )
    },
    [ring],
    [reduced, isCritical, index],
  )
  const aRing = useAnimatedStyle(() => ({
    opacity: 0.55 - ring.value * 0.55,
    transform: [{ scale: 1 + ring.value * 0.45 }],
  }))

  return (
    <View
      style={[
        styles.starWrap,
        { width: size + 4, height: size + 4 },
      ]}
    >
      <LinearGradient
        colors={[tone.accent, tone.fg]}
        start={{ x: 0.3, y: 0.3 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: 'rgba(246,251,239,0.30)',
        }}
      >
        <MaterialIcons name={icon} size={size * 0.5} color="#12211A" />
      </LinearGradient>
      {isCritical ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.starRing,
            {
              width: size + 6,
              height: size + 6,
              borderRadius: (size + 6) / 2,
              borderColor: tone.accent,
            },
            aRing,
          ]}
        />
      ) : null}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  outer: {
    marginVertical: 4,
  },
  shell: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(199,238,156,0.20)',
  },
  starsLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  star: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: 1,
  },
  // Header
  header: {
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDot: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#12211A',
  },
  avatarDotRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  brandLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: TEXT_ACCENT,
  },
  headerSub: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginTop: 2,
    fontWeight: '600',
  },
  impactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: COUNT_PILL_BG,
    borderWidth: 1,
    borderColor: COUNT_PILL_BORDER,
  },
  impactPillDone: {
    paddingHorizontal: 8,
  },
  impactPillSign: {
    fontSize: 11,
    fontWeight: '800',
    color: TEXT_ACCENT,
    letterSpacing: 0.4,
  },
  impactPillValue: {
    fontSize: 11,
    fontWeight: '800',
    color: TEXT_ACCENT,
    letterSpacing: 0.4,
  },
  // Lead bubble
  leadWrap: {
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  leadIntro: {
    fontSize: 10,
    fontWeight: '700',
    color: TEXT_TERTIARY,
    marginBottom: 6,
    paddingLeft: 4,
    letterSpacing: 0.2,
  },
  leadBubble: {
    backgroundColor: BUBBLE_BG,
    borderWidth: 1.5,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  bubbleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 6,
  },
  bubbleIconTile: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleHeadline: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    flexShrink: 1,
  },
  urgentBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  urgentBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
  bubbleTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: BUBBLE_TEXT,
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  bubbleBody: {
    fontSize: 12,
    color: BUBBLE_BODY,
    lineHeight: 16,
    marginTop: 4,
    fontWeight: '500',
  },
  // Constellation strip
  strip: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: HAIRLINE,
    backgroundColor: STRIP_BG,
  },
  stripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stripEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: TEXT_TERTIARY,
    flexShrink: 1,
  },
  openCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  openCtaText: {
    fontSize: 11,
    fontWeight: '800',
    color: TEXT_ACCENT,
    letterSpacing: 0.2,
  },
  stripStars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  stripEmpty: {
    fontSize: 12,
    color: TEXT_TERTIARY,
    fontWeight: '700',
    letterSpacing: 4,
  },
  stripDots: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 6,
  },
  stripDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(199,238,156,0.25)',
  },
  starWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  starRing: {
    position: 'absolute',
    borderWidth: 1.2,
  },
})
