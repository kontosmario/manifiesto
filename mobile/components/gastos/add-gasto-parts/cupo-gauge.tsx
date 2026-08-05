// Medidor del CUPO DE HOY del paso 2 del alta de gasto.
//
// Por qué no se usa `ZoneGauge` del kit: su track está cortado en 30/20/50,
// los umbrales del alta de fijos ("límite sano 30% del sueldo"). Acá lo que se
// mide es cuánto del CUPO DIARIO se consume, y ahí gastar el 100% no es un
// riesgo: es exactamente el plan. Con los cortes de fijos, un día normal se
// pintaría rojo. El propio docblock de `ZoneGauge` dice que un flujo con otro
// umbral pase por el skin — es lo que hace este archivo: reusa el MATERIAL
// (`skin.add.gauge`: alto, radio, sombra, perilla y los tres colores de zona)
// y sólo cambia dónde caen los cortes.
//
// Cortes: sano hasta 70% del cupo, ajustado 70-100%, pasado >100%. La perilla
// se clampea a 100 para dibujar —pasarse no tiene lugar en el track— y el
// exceso lo dicen el monto y la badge, no la posición.
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations } from '@/lib/motion'
import { useWizardSkin } from '@/components/wizard/wizard-skin'

export type CupoZone = 'sana' | 'media' | 'alta'

/** Zona del cupo diario. `pct` es el consumo del cupo, sin clampear: pasarse
 *  llega como 120, 140… y todo eso es zona `alta`. */
export function zoneForCupoPct(pct: number): CupoZone {
  return pct > 100 ? 'alta' : pct > 70 ? 'media' : 'sana'
}

/** Corte visible del track (el otro, el 100%, es el borde derecho). */
const HEALTHY_CUT = 70

export function CupoGauge({
  pct,
  fromPct,
  exceeds,
}: {
  pct: number
  /** Punto de partida de la perilla: viaja desde el consumo ANTES de este
   *  gasto hasta el de después, que es lo que comunica el impacto. */
  fromPct?: number
  /** El gasto deja el cupo en negativo: el tramo superior pasa de ámbar a
   *  terracota, para que la badge y el track no se contradigan. */
  exceeds: boolean
}) {
  const skin = useWizardSkin()
  const reduced = useReducedMotion()
  const clamp = (v: number) => Math.max(0, Math.min(100, v))
  const clamped = clamp(pct)
  const start = fromPct == null ? clamped : clamp(fromPct)
  const knobPct = useSharedValue(reduced ? clamped : start)

  useEffect(() => {
    if (reduced) {
      knobPct.value = clamped
      return
    }
    knobPct.value = withDelay(
      motionDurations.quick,
      withTiming(clamped, {
        duration: motionDurations.slow,
        easing: Easing.out(Easing.cubic),
      }),
    )
  }, [clamped, reduced, knobPct])

  const knobStyle = useAnimatedStyle(() => ({ left: `${knobPct.value}%` }))

  if (skin.kind !== 'neo') return null
  const g = skin.add.gauge
  const upperZone = exceeds ? g.zones[2] : g.zones[1]
  return (
    <View style={styles.gaugeWrap}>
      <View
        style={[
          styles.gaugeTrack,
          { height: g.height, borderRadius: g.radius, boxShadow: g.shadow },
        ]}
      >
        <View style={{ flex: HEALTHY_CUT, backgroundColor: g.zones[0] }} />
        <View style={{ flex: 100 - HEALTHY_CUT, backgroundColor: upperZone }} />
      </View>
      <View
        style={[
          styles.gaugeTick,
          {
            left: `${HEALTHY_CUT}%`,
            marginLeft: -g.tickWidth / 2,
            width: g.tickWidth,
            height: g.height,
            marginTop: -g.height / 2,
            backgroundColor: g.tickColor,
            opacity: g.tickOpacity,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.gaugeKnob,
          {
            marginLeft: -g.knob.width / 2,
            marginTop: -g.knob.height / 2,
            width: g.knob.width,
            height: g.knob.height,
            borderRadius: g.knob.radius,
            backgroundColor: g.knob.background,
            boxShadow: g.knob.shadow,
          },
          knobStyle,
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // La perilla sobresale del track arriba y abajo: el wrapper NO puede
  // clipear (por eso el `overflow:'hidden'` vive en el track) y el bloque que
  // lo contiene tiene que darle ese aire.
  gaugeWrap: { position: 'relative', marginTop: 12 },
  gaugeTrack: { flexDirection: 'row', overflow: 'hidden' },
  gaugeTick: { position: 'absolute', top: '50%' },
  gaugeKnob: { position: 'absolute', top: '50%' },
})
