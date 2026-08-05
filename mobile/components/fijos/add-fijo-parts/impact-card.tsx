// Cards de "Impacto en el presupuesto" del wizard add-fijo.
//
// Las piezas del rediseño (`ImpactColumns`, `ZoneGauge`, `HealthBadge`) se
// mudaron al kit genérico de wizard —`@/components/wizard/parts/*`— porque no
// tienen nada de fijos: reciben textos y porcentajes ya calculados. Acá quedan
// re-exportadas con la MISMA firma (la badge se envuelve para resolver el copy
// de fijos, que es lo único que el kit no puede saber).
//
// `ImpactRow` e `ImpactBar` NO se mudan: son la rama classic, la que dibuja la
// pantalla viva cuando no hay provider de piel, y no las va a reusar ningún
// flujo nuevo (el rediseño las reemplaza por las columnas + el medidor).
import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
// `useReducedMotion` va SIEMPRE del hook propio, nunca del de reanimated: el de
// la librería abre una suscripción a `AccessibilityInfo` por call site (el jank
// de Android gama baja) y además ignora el override de Motion del usuario y la
// heurística de device-year-class que resuelve el provider.
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { LinearGradient } from 'expo-linear-gradient'
import {
  HealthBadge as WizardHealthBadge,
  zoneForPct,
  type ImpactZone,
} from '@/components/wizard/parts/health-badge'
import { useAppTheme } from '@/theme/theme-provider'

export { ImpactColumns, type ImpactColumnsProps } from '@/components/wizard/parts/impact-columns'
export { ZoneGauge } from '@/components/wizard/parts/zone-gauge'
export { zoneForPct, type ImpactZone }

interface ImpactRowProps {
  label: string
  value: string
  /** Ausente cuando no hay base para el "% de tu sueldo" (income 0 /
   *  modo ingreso variable) — la fila muestra solo monto y delta. */
  sub?: string
  emphasis?: boolean
  deltaPct?: number
}

export function ImpactRow({
  label,
  value,
  sub,
  emphasis,
  deltaPct,
}: ImpactRowProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.impactRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.impactLabel, { color: theme.colors.textMuted }]}>{label}</Text>
        <Text
          style={[
            styles.impactValue,
            { color: theme.colors.text, fontSize: emphasis ? 22 : 18 },
          ]}
        >
          {value}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {sub != null ? (
          <Text style={[styles.impactSub, { color: theme.colors.textMuted }]}>{sub}</Text>
        ) : null}
        {deltaPct != null && deltaPct !== 0 ? (
          <Text
            style={[
              styles.impactDelta,
              {
                color: theme.isDark
                  ? deltaPct > 0
                    ? '#F8D1C3'  // V1 accent-200
                    : '#A6EF8F'  // V1 primary-300
                  : deltaPct > 0
                    ? '#B84014'  // V1 accent-600
                    : '#297811',  // V1 primary-800
              },
            ]}
          >
            {deltaPct > 0 ? '+' : ''}
            {deltaPct}pp
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/** Badge de salud con el copy de fijos ya resuelto. Firma intacta: la screen
 *  viva y el paso 2 la montan como siempre. */
export function HealthBadge({ pct, zone }: { pct: number; zone?: ImpactZone }) {
  const { t } = useTranslation()
  return (
    <WizardHealthBadge
      pct={pct}
      zone={zone}
      labels={{
        high: t('fijos:wizard.healthBadge.high'),
        mid: t('fijos:wizard.healthBadge.mid'),
        healthy: t('fijos:wizard.healthBadge.healthy'),
      }}
    />
  )
}

export function ImpactBar({
  beforePct,
  afterPct,
}: {
  beforePct: number
  afterPct: number
}) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const clampedBefore = Math.max(0, Math.min(100, beforePct))
  const clampedAfter = Math.max(0, Math.min(100, afterPct))
  const deltaWidth = Math.max(0, clampedAfter - clampedBefore)

  // La barra LLEGA en vez de aparecer pintada: el fill "antes" crece, y el
  // segmento "delta" (lo que agregás) se suma DESPUÉS con un stagger → el ojo
  // ve "esto es lo que sumas". reduceMotion → directo al valor final.
  const beforeProgress = useSharedValue(reduced ? 1 : 0)
  const deltaProgress = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) return
    beforeProgress.value = withTiming(1, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    })
    deltaProgress.value = withDelay(
      120,
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
    )
  }, [beforeProgress, deltaProgress, reduced])

  const beforeStyle = useAnimatedStyle(() => ({
    width: `${clampedBefore * beforeProgress.value}%`,
  }))
  const deltaStyle = useAnimatedStyle(() => ({
    width: `${deltaWidth * deltaProgress.value}%`,
  }))

  return (
    <View
      style={[styles.impactBarTrack, { backgroundColor: theme.colors.pageBg }]}
    >
      <Animated.View style={[styles.impactBarFill, beforeStyle]}>
        <LinearGradient
          colors={['#49D61F', '#297811'] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        style={[styles.impactBarFill, { left: `${clampedBefore}%` }, deltaStyle]}
      >
        <LinearGradient
          colors={['#F2A78C', '#EC7A51'] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  impactRow: { flexDirection: 'row', alignItems: 'center' },
  impactLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  impactValue: { fontWeight: '800', letterSpacing: -0.4, marginTop: 2 },
  impactSub: { fontSize: 11, fontWeight: '600' },
  impactDelta: { fontSize: 11, fontWeight: '800', marginTop: 2 },
  impactBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
    position: 'relative',
  },
  impactBarFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 4,
    overflow: 'hidden',
  },
})
