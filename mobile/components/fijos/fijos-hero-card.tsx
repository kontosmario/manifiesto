import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  Easing,
  LinearTransition,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { CardParticles } from '@/components/ui/card-particles'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { formatMoney } from '@/utils/money'
import { authTokens } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface FijosHeroCardProps {
  mes?: string
  diasRestantes?: number
  totalFijos?: number
  montoPagado?: number
  cantidadPagados?: number
  cantidadPendientes?: number
  dineroLibre?: number
  porcentajeSueldo?: number
}

/**
 * Fijos hero card — aligns with the Home/Gastos hero language:
 *  · LinearGradient shell driven by theme.heroGradient.
 *  · HeroAurora (three drifting blobs) + ShineOverlay (diagonal sweep).
 *  · BreatheDot next to the eyebrow label.
 *  · CountUpText for every monetary value (shared Reanimated hook).
 *  · RiseView cascade matching the screen-wide wave (0/80/160/240/320/400).
 *  · Animated.View layout={LinearTransition} so value changes transition
 *    the card height instead of snapping.
 */
export function FijosHeroCard({
  mes = 'Abril',
  diasRestantes = 0,
  totalFijos = 0,
  montoPagado = 0,
  cantidadPagados = 0,
  cantidadPendientes = 0,
  dineroLibre = 0,
  porcentajeSueldo = 0,
}: FijosHeroCardProps) {
  const { theme } = useAppTheme()
  const porcentaje = totalFijos > 0 ? Math.round((montoPagado / totalFijos) * 100) : 0
  const montoPendiente = Math.max(0, totalFijos - montoPagado)

  return (
    <RiseView delay={40}>
      <Animated.View layout={LinearTransition.duration(260)}>
        <LinearGradient
          colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[styles.card, { borderColor: 'rgba(166,239,143,0.12)' }]}
        >
          <ShineOverlay
            width={430}
            height={360}
            tint={theme.colors.shineOverlay}
            delayMs={1000}
            periodMs={4200}
          />
          {/* Twinkling firefly field — same shared-wave technique
              as the Home and Gastos hero cards. */}
          <CardParticles count={12} accentColor={authTokens.peach} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <BreatheDot
                size={8}
                color={theme.colors.heroAccent}
                glow={theme.colors.heroAccent}
              />
              <Text style={[styles.titulo, { color: theme.colors.heroAccent }]}>
                Gastos fijos · {mes}
              </Text>
            </View>
          </View>
          <Text style={[styles.subtitulo, { color: theme.colors.heroMuted2 }]}>
            Quedan {diasRestantes} {diasRestantes === 1 ? 'día' : 'días'} en el ciclo
          </Text>

          <View style={styles.montosRow}>
            <View>
              <Text style={[styles.montoLabel, { color: theme.colors.heroMuted2 }]}>
                Ya pagaste
              </Text>
              <CountUpText
                value={montoPagado}
                format={(n) => formatMoney(n)}
                style={[styles.montoPagado, { color: theme.colors.heroText }]}
              />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.montoLabel, { color: theme.colors.heroMuted2 }]}>
                Te falta pagar
              </Text>
              <CountUpText
                value={montoPendiente}
                format={(n) => formatMoney(n)}
                style={[styles.montoPendiente, { color: '#F2A78C' }]}
              />
            </View>
          </View>

          <ProgressBar porcentaje={porcentaje} accent={theme.colors.heroAccent} />
          <View style={styles.progressFooter}>
            <Text style={[styles.progressPct, { color: theme.colors.heroAccent }]}>
              {porcentaje}% pagado
            </Text>
            <Text style={[styles.progressTotal, { color: theme.colors.heroMuted2 }]}>
              Total: {formatMoney(totalFijos)}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <StatCard
              label="Pagados"
              value={cantidadPagados}
              sublabel="gastos listos"
              accent={theme.colors.heroAccent}
              accentBg="rgba(166,239,143,0.10)"
              icon="check"
            />
            <StatCard
              label="Por pagar"
              value={cantidadPendientes}
              sublabel="pendientes"
              accent="#F2A78C"
              accentBg="rgba(242,167,140,0.12)"
              icon="warning"
            />
          </View>

          <View style={[styles.bottomRow, { borderTopColor: 'rgba(255,255,255,0.12)' }]}>
            <View>
              <Text style={[styles.bottomLabel, { color: theme.colors.heroAccent }]}>
                DINERO LIBRE ESTE MES
              </Text>
              <CountUpText
                value={dineroLibre}
                format={(n) => formatMoney(n)}
                style={[styles.bottomMonto, { color: theme.colors.heroText }]}
              />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.bottomPctLabel, { color: theme.colors.heroMuted2 }]}>
                de tu sueldo
              </Text>
              <Text style={[styles.bottomPct, { color: theme.colors.heroMuted }]}>
                {porcentajeSueldo}%
              </Text>
              <Text style={[styles.bottomPctSub, { color: theme.colors.heroAccent }]}>
                va a fijos
              </Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </RiseView>
  )
}

function ProgressBar({ porcentaje, accent }: { porcentaje: number; accent: string }) {
  const reduced = useReducedMotion()
  const progress = useSharedValue(reduced ? clampPct(porcentaje) : 0)
  const dotScale = useSharedValue(reduced ? 1 : 0)
  const dotGlow = useSharedValue(0.55)

  useEffect(() => {
    if (reduced) {
      progress.value = clampPct(porcentaje)
      dotScale.value = 1
      return
    }
    progress.value = withDelay(
      80,
      withTiming(clampPct(porcentaje), {
        duration: 900,
        easing: Easing.out(Easing.cubic),
      }),
    )
    dotScale.value = withDelay(
      680,
      withSpring(1, { damping: 11, stiffness: 180, mass: 0.7 }),
    )
    dotGlow.value = withDelay(
      900,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.55, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      ),
    )
    return () => {
      cancelAnimation(progress)
      cancelAnimation(dotScale)
      cancelAnimation(dotGlow)
    }
  }, [porcentaje, reduced, progress, dotScale, dotGlow])

  // Fill uses scaleX (GPU transform, no layout). `transformOrigin: left`
  // anchors the scale to the track's left edge.
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }))
  // Dot rides the end of the fill. Previously this animated `left: %`
  // which forces a per-frame layout pass on Android. We now measure
  // the track once via onLayout and convert progress (0..1) into a
  // pixel translateX — pure compositor work.
  const [trackWidthPx, setTrackWidthPx] = useState(0)
  const handleTrackLayout = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width
    if (w > 0 && w !== trackWidthPx) setTrackWidthPx(w)
  }
  const dotStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * trackWidthPx - 7 },
      { scale: dotScale.value },
    ],
    opacity: dotGlow.value,
  }))

  return (
    <View
      onLayout={handleTrackLayout}
      style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
    >
      <Animated.View
        style={[
          styles.progressFill,
          { backgroundColor: accent },
          fillStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.progressDot,
          {
            backgroundColor: '#F2EAD3',
            borderColor: accent,
            shadowColor: accent,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: 4,
            elevation: 3,
          },
          dotStyle,
        ]}
      />
    </View>
  )
}

function clampPct(p: number): number {
  return Math.min(Math.max(p, 0), 100) / 100
}

function StatCard({
  label,
  value,
  sublabel,
  accent,
  accentBg,
  icon,
}: {
  label: string
  value: number
  sublabel: string
  accent: string
  accentBg: string
  icon: 'check' | 'warning'
}) {
  return (
    <View
      style={[
        styles.statCard,
        { borderColor: accent + '55', backgroundColor: accentBg },
      ]}
    >
      <View style={styles.statCardHeader}>
        <View style={[styles.iconBadge, { backgroundColor: accent }]}>
          <Text style={styles.iconText}>{icon === 'check' ? '✓' : '!'}</Text>
        </View>
        <Text style={[styles.statLabel, { color: accent }]}>{label}</Text>
      </View>
      <CountUpText
        value={value}
        format={(n) => String(n)}
        style={styles.statValue}
      />
      <Text style={[styles.statSublabel, { color: accent }]}>{sublabel}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  subtitulo: {
    fontSize: 12,
    marginTop: 4,
  },
  montosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 16,
    marginBottom: 10,
  },
  montoLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  montoPagado: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 30,
  },
  montoPendiente: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 22,
  },
  progressTrack: {
    position: 'relative',
    height: 8,
    borderRadius: 99,
    overflow: 'visible',
    marginBottom: 6,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    borderRadius: 99,
    transformOrigin: 'left' as const,
  },
  progressDot: {
    position: 'absolute',
    top: -3,
    left: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  progressPct: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressTotal: {
    fontSize: 11,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  statCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  iconBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#12211A',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: '#F2EAD3',
    lineHeight: 28,
  },
  statSublabel: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  bottomLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  bottomMonto: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 26,
  },
  bottomPctLabel: {
    fontSize: 11,
  },
  bottomPct: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'right',
  },
  bottomPctSub: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'right',
  },
})
