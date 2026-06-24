import { memo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { RiseView } from '@/components/home/animated/rise-view'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Recordatorio del período libre en Home. Paleta CALMA alineada con Settings:
 * superficie `primarySurface` (≤6 días) o `creamCard` (7+) con borde estándar,
 * ícono/texto en tokens neutros y CTA `primary`. Sin gradiente forest ni
 * luciérnagas (esos quedan para el hero de membresía y los tiles del plan).
 * Informativo — NUNCA dice "prueba/gratis". La urgencia la comunica el COPY,
 * no el color. Dismissible por sesión; el gate de cuándo mostrarlo lo decide
 * el host (Home).
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
  const ctaLabel = urgent ? 'Suscribirme' : 'Ver planes'

  const handleCta = () => {
    void triggerHaptic('selection')
    onSeePlans()
  }
  const handleDismiss = () => {
    void triggerHaptic('selection')
    setDismissed(true)
  }

  return (
    <RiseView>
      <View
        style={[
          styles.card,
          {
            backgroundColor:
              daysLeft <= 6
                ? theme.colors.primarySurface
                : theme.colors.creamCard,
            borderColor: theme.colors.border,
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        <View style={styles.inner}>
          <View style={[styles.icon, { backgroundColor: theme.colors.creamCard }]}>
            <MaterialIcons
              name="lock-open"
              size={15}
              color={theme.colors.primary}
            />
          </View>
          <View style={styles.txt}>
            <Text style={[styles.t1, { color: theme.colors.text }]}>{title}</Text>
            <Text style={[styles.t2, { color: theme.colors.textMuted }]}>
              {subtitle}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
            onPress={handleCta}
            hitSlop={8}
          >
            <View style={[styles.cta, { backgroundColor: theme.colors.primary }]}>
              <Text style={[styles.ctaText, { color: theme.colors.creamCard }]}>
                {ctaLabel}
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            onPress={handleDismiss}
            hitSlop={10}
            style={styles.close}
          >
            <MaterialIcons name="close" size={15} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      </View>
    </RiseView>
  )
})

const styles = StyleSheet.create({
  card: { borderRadius: 16, overflow: 'hidden' },
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
  },
  txt: { flex: 1 },
  t1: { fontSize: 12, fontWeight: '800' },
  t2: { fontSize: 9, marginTop: 1 },
  cta: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 },
  ctaText: { fontSize: 10, fontWeight: '800' },
  close: { padding: 2 },
})
