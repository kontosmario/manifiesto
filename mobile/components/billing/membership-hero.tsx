import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CardParticles } from '@/components/ui/card-particles'
import { FernMark } from '@/components/billing/fern-mark'
import { getStateTokens, type SemanticState } from '@/theme/state-tokens'
import { useAppTheme } from '@/theme/theme-provider'
import type { MembershipVariant } from '@/features/billing/membership-state'

/**
 * Hero de "Mi suscripción" — card forest con luciérnagas + helecho de
 * watermark. Refleja el estado del entitlement vía `variant`: el pill de
 * estado toma su color del sistema unificado (getStateTokens) según el
 * `tone`, y el `heroLine` matiza la nuance (renovación / grace / cortesía).
 * Mockups: 06-mi-suscripcion-v2.html (.hero6) y 08-con-logo.html (.hero).
 */
export interface MembershipHeroProps {
  planName: string
  variant: MembershipVariant
}

/** tone del entitlement → estado semántico del pill. */
const TONE_TO_STATE: Record<MembershipVariant['tone'], SemanticState> = {
  active: 'positive',
  warn: 'caution',
  comped: 'neutral',
}

export const MembershipHero = memo(function MembershipHero({
  planName,
  variant,
}: MembershipHeroProps) {
  const { theme } = useAppTheme()
  const pill = getStateTokens(TONE_TO_STATE[variant.tone], theme)

  return (
    <LinearGradient
      colors={
        [...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]
      }
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.card, { overflow: 'hidden', borderColor: 'rgba(166,239,143,0.22)' }]}
    >
      {/* Campo de luciérnagas — detrás del contenido (z implícito 1). */}
      <CardParticles count={5} color="#FFFBF2" accentColor="#A6EF8F" />

      {/* Helecho watermark: esquina sup-derecha con bleed, casi imperceptible. */}
      <FernMark variant="cream" size={104} style={styles.watermark} />

      {/* Contenido por encima de partículas y watermark. */}
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={[theme.typography.eyebrow, { color: theme.colors.heroAccent }]}>
            Tu membresía
          </Text>
          <View
            style={[styles.pill, { backgroundColor: pill.bg, borderColor: pill.border }]}
          >
            <View style={[styles.pillDot, { backgroundColor: pill.fg }]} />
            <Text style={[styles.pillLabel, { color: pill.fg }]}>
              {variant.statusLabel}
            </Text>
          </View>
        </View>

        <Text style={[styles.planName, { color: theme.colors.heroText }]}>
          {planName}
        </Text>
        <Text style={[styles.heroLine, { color: theme.colors.heroText }]}>
          {variant.heroLine}
        </Text>
      </View>
    </LinearGradient>
  )
})

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    position: 'relative',
  },
  watermark: {
    position: 'absolute',
    right: -22,
    top: -18,
    opacity: 0.13,
    zIndex: 1,
  },
  content: {
    position: 'relative',
    zIndex: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  pillLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  planName: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginTop: 10,
  },
  heroLine: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
    opacity: 0.82,
  },
})
