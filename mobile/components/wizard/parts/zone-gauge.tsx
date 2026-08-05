// Medidor de zonas del bloque de impacto. Extraído de
// `add-fijo-parts/impact-card.tsx` sin tocar el markup. Es puro: recibe
// porcentajes, no sabe de qué son.
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

/** Track de 9px con los tramos 30/20/50, dos ticks en los cortes y la perilla
 *  en el porcentaje actual. El handoff no dibuja ninguna barra dentro de la
 *  card de impacto: dibuja ésta, en el bloque libre.
 *
 *  La perilla VIAJA de `fromPct` a `pct` al montar: el ojo ve el
 *  desplazamiento —"esto es lo que sumás"— en vez de encontrar la perilla ya
 *  puesta. El arranque espera a que la card termine de entrar.
 *
 *  Los cortes 30/50 son los del handoff de fijos (límite sano 30% del sueldo).
 *  Un flujo con otro umbral tiene que pasar por el skin, no por acá: el track
 *  sale de `skin.add.gauge`. */
export function ZoneGauge({ pct, fromPct }: { pct: number; fromPct?: number }) {
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
  return (
    <View style={styles.gaugeWrap}>
      <View
        style={[
          styles.gaugeTrack,
          { height: g.height, borderRadius: g.radius, boxShadow: g.shadow },
        ]}
      >
        {[30, 20, 50].map((w, i) => (
          <View key={w} style={{ flex: w, backgroundColor: g.zones[i] }} />
        ))}
      </View>
      {[30, 50].map((at) => (
        <View
          key={at}
          style={[
            styles.gaugeTick,
            {
              left: `${at}%`,
              marginLeft: -g.tickWidth / 2,
              width: g.tickWidth,
              height: g.height,
              marginTop: -g.height / 2,
              backgroundColor: g.tickColor,
              opacity: g.tickOpacity,
            },
          ]}
        />
      ))}
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
  // La perilla mide 17px sobre un track de 9: SOBRESALE 4px arriba y abajo.
  // El wrapper no puede clipear (por eso el `overflow:'hidden'` vive en el
  // track, no acá) y el bloque que lo contiene tiene que darle ese aire.
  gaugeWrap: { position: 'relative', marginTop: 12 },
  gaugeTrack: { flexDirection: 'row', overflow: 'hidden' },
  gaugeTick: { position: 'absolute', top: '50%' },
  gaugeKnob: { position: 'absolute', top: '50%' },
})
