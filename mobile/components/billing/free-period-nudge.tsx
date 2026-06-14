import { memo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { CardParticles } from '@/components/ui/card-particles'
import { RiseView } from '@/components/home/animated/rise-view'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Recordatorio del período libre en Home. Escala suave según los días que
 * quedan: 7+ calmo (crema) · 3-6 mint · 1-2 forest + luciérnagas (nunca
 * alarmista). Informativo — NUNCA dice "prueba/gratis". Dismissible por
 * sesión. El gate de cuándo mostrarlo lo decide el host (Home).
 */
export interface FreePeriodNudgeProps {
  daysLeft: number
  onSeePlans: () => void
}

export const FreePeriodNudge = memo(function FreePeriodNudge({
  daysLeft,
  onSeePlans,
}: FreePeriodNudgeProps) {
  const { theme } = useAppTheme()
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const urgent = daysLeft <= 2
  const title = urgent
    ? 'Último día de acceso completo'
    : `Te quedan ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`
  const subtitle = urgent
    ? 'Seguí sin cortes · desde $3.33/mes'
    : 'de acceso completo'
  const ctaLabel = daysLeft <= 2 ? 'Suscribirme' : 'Ver planes'

  const handleCta = () => {
    void triggerHaptic('selection')
    onSeePlans()
  }
  const handleDismiss = () => {
    void triggerHaptic('selection')
    setDismissed(true)
  }

  // Forest + luciérnagas para urgente; mint/crema calmo para el resto.
  const Body = (
    <View style={styles.inner}>
      {urgent ? (
        <CardParticles count={2} color="#FFFBF2" accentColor="#A6EF8F" />
      ) : null}
      <View style={[styles.icon, { backgroundColor: urgent ? 'rgba(166,239,143,0.18)' : theme.colors.primarySurface }]}>
        <MaterialIcons
          name="lock-open"
          size={15}
          color={urgent ? theme.colors.heroAccent : theme.colors.primary}
        />
      </View>
      <View style={styles.txt}>
        <Text style={[styles.t1, { color: urgent ? theme.colors.heroText : theme.colors.text }]}>
          {title}
        </Text>
        <Text style={[styles.t2, { color: urgent ? theme.colors.heroText : theme.colors.textMuted }]}>
          {subtitle}
        </Text>
      </View>
      <Pressable onPress={handleCta} hitSlop={8}>
        <View style={[styles.cta, { backgroundColor: theme.colors.heroAccent }]}>
          <Text style={[styles.ctaText, { color: theme.colors.heroGradient[1] }]}>
            {ctaLabel}
          </Text>
        </View>
      </Pressable>
      <Pressable onPress={handleDismiss} hitSlop={10} style={styles.close}>
        <MaterialIcons
          name="close"
          size={15}
          color={urgent ? theme.colors.heroText : theme.colors.textMuted}
        />
      </Pressable>
    </View>
  )

  return (
    <RiseView>
      {urgent ? (
        <LinearGradient
          colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, styles.cardForest]}
        >
          {Body}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.card,
            {
              backgroundColor: daysLeft <= 6 ? theme.colors.primarySurface : theme.colors.creamCard,
              borderColor: theme.colors.border,
              borderWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          {Body}
        </View>
      )}
    </RiseView>
  )
})

const styles = StyleSheet.create({
  card: { borderRadius: 16, overflow: 'hidden' },
  cardForest: {},
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  txt: { flex: 1, zIndex: 2 },
  t1: { fontSize: 12, fontWeight: '800' },
  t2: { fontSize: 9, marginTop: 1, opacity: 0.85 },
  cta: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, zIndex: 2 },
  ctaText: { fontSize: 10, fontWeight: '800' },
  close: { padding: 2, zIndex: 2 },
})
