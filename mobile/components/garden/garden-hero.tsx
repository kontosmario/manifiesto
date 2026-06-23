import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CardParticles } from '@/components/ui/card-particles'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { FernMark } from '@/components/billing/fern-mark'
import { useAppTheme } from '@/theme/theme-provider'

interface GardenHeroProps {
  streak: number
}

const HERO_SUB =
  'Una semilla por cada día que registrás. Los huecos son días que no cargaste, tranquilo: el jardín sigue.'

/**
 * Hero "Racha activa" de Mi jardín. Misma superficie que la card de planes
 * destacada (plan-tiles · YearlyTile): gradiente `heroGradient` + luciérnagas
 * crema/menta (CardParticles) + helecho de marca como watermark. El número de
 * racha usa el conteo fluido del hero de Home.
 */
function GardenHeroImpl({ streak }: GardenHeroProps) {
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
      {/* Helecho watermark — esquina inferior-derecha con bleed. */}
      <FernMark variant="cream" size={132} style={styles.fern} />

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
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    padding: 22,
    paddingBottom: 24,
    overflow: 'hidden',
  },
  fern: {
    position: 'absolute',
    right: -18,
    bottom: -22,
    opacity: 0.13,
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
    maxWidth: '88%',
  },
})

export const GardenHero = memo(GardenHeroImpl)
