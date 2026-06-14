import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { CardParticles } from '@/components/ui/card-particles'
import { freeAccessBadgeLabel } from '@/features/billing/free-access-nudge'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Banner informativo del período libre (estado de cuenta — NUNCA "prueba" ni
 * "gratis"; ver compliance del spec §7). Vive arriba del paywall y comunica
 * que el acceso sigue completo. Gradiente forest + luciérnagas, ícono
 * `lock-open` en cuadradito mint suave + copy neutro en 2 líneas.
 */
export interface FreePeriodBannerProps {
  daysLeft: number
}

export const FreePeriodBanner = memo(function FreePeriodBanner({
  daysLeft,
}: FreePeriodBannerProps) {
  const { theme } = useAppTheme()
  return (
    <LinearGradient
      colors={
        [...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.banner, { overflow: 'hidden' }]}
    >
      {/* Campo de luciérnagas detrás del contenido (zIndex 1). */}
      <CardParticles count={3} color="#FFFBF2" accentColor="#A6EF8F" />

      {/* Contenido por encima de las partículas. */}
      <View style={styles.content}>
        <View style={styles.iconBox}>
          <MaterialIcons name="lock-open" size={16} color={theme.colors.heroAccent} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.title, { color: theme.colors.heroText }]}>
            Acceso completo
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.heroText }]}>
            {freeAccessBadgeLabel(daysLeft)}
          </Text>
        </View>
      </View>
    </LinearGradient>
  )
})

const styles = StyleSheet.create({
  banner: {
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 12,
    position: 'relative',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 2,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 999,
    // Mint suave del mockup (rgba(166,239,143,.18)) — único hex permitido
    // junto al crema de las luciérnagas.
    backgroundColor: 'rgba(166,239,143,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
    // Subtexto atenuado (~0.7) como en el mockup.
    opacity: 0.7,
  },
})
