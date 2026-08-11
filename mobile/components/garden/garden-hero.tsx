import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { CardParticles } from '@/components/ui/card-particles'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { GARDEN_GEOMETRY, GARDEN_SPEC } from '@/components/redesign/garden/garden-spec'
import { cssGradient, neoParticlePresets } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

interface GardenHeroProps {
  streak: number
  /** Total de brotes (días registrados). */
  total: number
  /** Récord histórico de racha. */
  record: number
  /** Semillas / escudos (revive un día olvidado). */
  seeds: number
}

const HERO_PARTICLES = neoParticlePresets.hero

const formatCount = (n: number) => String(Math.round(n))
/** Las semillas se leen como multiplicador ("×0"), igual que en 3g. */
const formatSeeds = (n: number) => `×${Math.round(n)}`

function HeroStat({
  label,
  value,
  format,
  labelInk,
  valueInk,
  divider,
}: {
  label: string
  value: number
  format: (n: number) => string
  labelInk: string
  valueInk: string
  /** Los stats 2 y 3 arrancan con la línea vertical del handoff. */
  divider?: string
}) {
  return (
    <View
      style={[
        styles.stat,
        divider ? [styles.statDivided, { borderLeftColor: divider }] : null,
      ]}
    >
      <Text style={[styles.statLabel, { color: labelInk }]}>{label}</Text>
      <CountUpText
        value={value}
        format={format}
        style={[styles.statValue, { color: valueInk }]}
      />
    </View>
  )
}

/**
 * Hero "Racha activa" de Mi jardín (3g): superficie verde radio 32 con
 * luciérnagas clipeadas al radio y la tira JARDÍN / RÉCORD / SEMILLAS
 * separada por la línea de 1.5px del handoff.
 */
function GardenHeroImpl({ streak, total, record, seeds }: GardenHeroProps) {
  const theme = useThemeTokens()
  const s = GARDEN_SPEC[theme.mode]
  const { t } = useTranslation()

  return (
    <View
      style={[
        styles.card,
        cssGradient(s.heroGradientCss, s.heroFallback),
        { boxShadow: s.heroShadow },
      ]}
    >
      <View pointerEvents="none" style={styles.particleClip}>
        <CardParticles
          count={HERO_PARTICLES.count}
          color={HERO_PARTICLES.colors[2]}
          accentColor={HERO_PARTICLES.colors[0]}
          peachColor={HERO_PARTICLES.colors[1]}
        />
      </View>

      <View style={styles.content}>
        <Text style={[styles.label, { color: s.heroLabelInk }]}>
          {t('garden:hero.label')}
        </Text>
        <View style={styles.numberRow}>
          <CountUpText
            value={streak}
            format={formatCount}
            unit="integer"
            flourish
            glowColor={s.heroLabelInk}
            style={[styles.number, { color: s.heroValueInk }]}
            accessibilityLabel={t('garden:hero.streakA11y', { count: streak })}
          />
          <Text style={[styles.unit, { color: s.heroLabelInk }]}>
            {t('garden:hero.unit')}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: s.heroDivider }]} />
        <View style={styles.statStrip}>
          <HeroStat
            label={t('garden:hero.statGarden')}
            value={total}
            format={formatCount}
            labelInk={s.heroLabelInk}
            valueInk={s.heroValueInk}
          />
          <HeroStat
            label={t('garden:hero.statRecord')}
            value={record}
            format={formatCount}
            labelInk={s.heroLabelInk}
            valueInk={s.heroValueInk}
            divider={s.heroDivider}
          />
          <HeroStat
            label={t('garden:hero.statSeeds')}
            value={seeds}
            format={formatSeeds}
            labelInk={s.heroLabelInk}
            valueInk={s.heroValueInk}
            divider={s.heroDivider}
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: GARDEN_GEOMETRY.heroRadius,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  // Las luciérnagas viven en su propia capa clipeada: la card NO puede
  // llevar overflow hidden (recortaría la línea de luz del boxShadow).
  particleClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: GARDEN_GEOMETRY.heroRadius,
    overflow: 'hidden',
  },
  content: {
    position: 'relative',
    zIndex: 2,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.61,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  number: {
    fontSize: 52,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    // Headroom sobre el fontSize: en iOS la baseline cae a
    // `lineHeight − descent` del tope de la caja, y las cifras de Nunito 900
    // suben 0.716em. Con `lineHeight == fontSize` el número salía rebanado
    // arriba. La caja crece SOLO hacia arriba (`alignItems: 'flex-end'` alinea
    // por el borde inferior), así que la unidad no se mueve.
    lineHeight: 52 * 1.2,
    letterSpacing: -1.6,
  },
  unit: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    lineHeight: 18.5,
    paddingBottom: 3,
  },
  divider: {
    height: 1.5,
    marginTop: 14,
  },
  statStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 12,
  },
  stat: {
    flex: 1,
  },
  statDivided: {
    borderLeftWidth: 1.5,
    paddingLeft: 14,
  },
  statLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.95,
  },
  statValue: {
    fontSize: 19,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.4,
    marginTop: 2,
  },
})

export const GardenHero = memo(GardenHeroImpl)
