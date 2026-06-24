import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CardParticles } from '@/components/ui/card-particles'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { FernMark } from '@/components/billing/fern-mark'
import { useAppTheme } from '@/theme/theme-provider'

interface GardenHeroProps {
  streak: number
  /** Total de brotes (días registrados). */
  total: number
  /** Récord histórico de racha. */
  record: number
  /** Semillas / escudos (revive un día olvidado). */
  seeds: number
}

const HERO_SUB =
  'Una semilla por cada día que registrás. Los huecos son días que no cargaste, tranquilo: el jardín sigue.'

function HeroStat({ label, value }: { label: string; value: string }) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: theme.colors.heroText }]}>{label}</Text>
      <Text style={[styles.statValue, { color: theme.colors.heroText }]}>{value}</Text>
    </View>
  )
}

/**
 * Hero "Racha activa" de Mi jardín. Misma superficie que la card de planes
 * destacada (plan-tiles · YearlyTile): gradiente `heroGradient` + luciérnagas
 * crema/menta + helecho de marca como watermark grande. Abajo, una tira de
 * stats (jardín / récord / semillas) integrada en la misma card.
 */
function GardenHeroImpl({ streak, total, record, seeds }: GardenHeroProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.card}>
      <LinearGradient
        colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Luciérnagas detrás del contenido (crema + menta, como la card de planes). */}
      <CardParticles count={6} color="#FFFBF2" accentColor={theme.colors.heroAccent} />
      {/* Helecho de marca — watermark GRANDE, bleed por la derecha. */}
      <FernMark variant="cream" size={232} style={styles.fern} />

      <View style={styles.content}>
        <Text style={[styles.label, { color: theme.colors.heroAccent }]}>RACHA ACTIVA</Text>
        <View style={styles.numberRow}>
          <CountUpText
            value={streak}
            format={(n) => String(Math.round(n))}
            unit="integer"
            flourish
            glowColor={theme.colors.heroAccent}
            style={[styles.number, { color: theme.colors.heroText }]}
            accessibilityLabel={`${streak} brotes seguidos`}
          />
          <Text style={[styles.unit, { color: theme.colors.heroMuted }]}>brotes{'\n'}seguidos</Text>
        </View>
        <Text style={[styles.sub, { color: theme.colors.heroMuted }]}>{HERO_SUB}</Text>

        <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
        <View style={styles.statStrip}>
          <HeroStat label="JARDÍN" value={String(total)} />
          <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
          <HeroStat label="RÉCORD" value={`${record}`} />
          <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
          <HeroStat label="SEMILLAS" value={`×${seeds}`} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    padding: 22,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  fern: {
    position: 'absolute',
    right: -52,
    top: 6,
    opacity: 0.16,
  },
  content: {
    position: 'relative',
    zIndex: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
    marginTop: 8,
  },
  number: {
    fontSize: 60,
    fontWeight: '900',
    lineHeight: 58,
    letterSpacing: -2.2,
  },
  unit: {
    fontSize: 16,
    fontWeight: '700',
    paddingBottom: 9,
    lineHeight: 18,
  },
  sub: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 13,
    lineHeight: 19,
    maxWidth: '82%',
  },
  divider: {
    height: 1,
    marginTop: 18,
  },
  statStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  statValue: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginTop: 3,
  },
  statDivider: {
    width: 1,
    height: 28,
    marginHorizontal: 6,
  },
})

export const GardenHero = memo(GardenHeroImpl)
