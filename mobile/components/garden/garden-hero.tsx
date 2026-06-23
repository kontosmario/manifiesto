import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { AuroraBloom } from '@/components/ui/aurora-bloom'
import { CardParticles } from '@/components/ui/card-particles'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { FernMark } from '@/components/billing/fern-mark'
import { useAppTheme } from '@/theme/theme-provider'

interface GardenHeroProps {
  streak: number
}

// Gradiente forest del hero (155deg #2A5A30 → #173B1F) — del prototipo hifi.
const HERO_GRADIENT = ['#2A5A30', '#173B1F'] as const

const HERO_SUB =
  'Una semilla por cada día que registrás. Los huecos son días que no cargaste — tranquilo, el jardín sigue.'

/**
 * Hero "Racha activa" de la pantalla Mi jardín. Gradiente forest +
 * luciérnagas (CardParticles) + glow del helecho de marca + número de racha
 * con conteo fluido. Decoración detrás del contenido (overflow:hidden).
 */
function GardenHeroImpl({ streak }: GardenHeroProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.card}>
      <LinearGradient
        colors={HERO_GRADIENT}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.65, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* glow radial abajo-derecha */}
      <View style={styles.glow} pointerEvents="none">
        <AuroraBloom color={theme.colors.heroAccent} size={240} intensity={0.22} />
      </View>
      {/* helecho de marca arriba-derecha */}
      <View style={styles.fern} pointerEvents="none">
        <FernMark variant="mint" size={124} />
      </View>
      {/* luciérnagas */}
      <CardParticles count={7} color={theme.colors.heroAccent} accentColor={theme.colors.peach} />

      <View style={styles.content}>
        <Text style={styles.label}>RACHA ACTIVA</Text>
        <View style={styles.numberRow}>
          <CountUpText
            value={streak}
            format={(n) => String(Math.round(n))}
            unit="integer"
            flourish
            glowColor={theme.colors.heroAccent}
            style={styles.number}
            accessibilityLabel={`${streak} brotes seguidos`}
          />
          <Text style={styles.unit}>
            brotes{'\n'}seguidos
          </Text>
        </View>
        <Text style={styles.sub}>{HERO_SUB}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 30,
    padding: 24,
    paddingBottom: 26,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    right: -90,
    bottom: -100,
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fern: {
    position: 'absolute',
    right: 6,
    top: 12,
    opacity: 0.9,
  },
  content: {
    position: 'relative',
  },
  label: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#9FCB93',
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
    marginTop: 8,
  },
  number: {
    fontSize: 62,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 56,
    letterSpacing: -2.4,
  },
  unit: {
    fontSize: 17,
    fontWeight: '700',
    color: '#C4D6BC',
    paddingBottom: 8,
    lineHeight: 19,
  },
  sub: {
    fontSize: 13.5,
    color: '#A9C2A1',
    marginTop: 12,
    lineHeight: 19.5,
  },
})

export const GardenHero = memo(GardenHeroImpl)
