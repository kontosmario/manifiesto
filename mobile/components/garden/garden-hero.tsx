import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
        <Text style={[styles.label, { color: theme.colors.heroAccent }]}>
          {t('garden:hero.label')}
        </Text>
        <View style={styles.numberRow}>
          <CountUpText
            value={streak}
            format={(n) => String(Math.round(n))}
            unit="integer"
            flourish
            glowColor={theme.colors.heroAccent}
            style={[styles.number, { color: theme.colors.heroText }]}
            accessibilityLabel={t('garden:hero.streakA11y', { count: streak })}
          />
          <Text style={[styles.unit, { color: theme.colors.heroMuted }]}>
            {t('garden:hero.unit')}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
        <View style={styles.statStrip}>
          <HeroStat label={t('garden:hero.statGarden')} value={String(total)} />
          <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
          <HeroStat label={t('garden:hero.statRecord')} value={`${record}`} />
          <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
          <HeroStat label={t('garden:hero.statSeeds')} value={`×${seeds}`} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    padding: 18,
    paddingBottom: 14,
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
    fontSize: 48,
    fontWeight: '900',
    lineHeight: 46,
    letterSpacing: -1.6,
  },
  unit: {
    fontSize: 15,
    fontWeight: '700',
    paddingBottom: 7,
    lineHeight: 17,
  },
  divider: {
    height: 1,
    marginTop: 14,
  },
  statStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
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
    fontSize: 17,
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
