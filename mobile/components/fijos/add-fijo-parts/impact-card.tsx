// Cards de "Impacto en el presupuesto" del wizard add-fijo: ImpactRow
// (label + value + delta), ImpactBar (before vs after gradient bar) y
// HealthBadge (alto/medio/sano). Extraído de `add-fijo-v2-screen.tsx`.
//
// En la piel `neo` el bloque cambia de ESTRUCTURA, no solo de material: las
// dos filas apiladas pasan a dos columnas enfrentadas por una flecha
// (`ImpactColumns`) y la barra de delta se reemplaza por el medidor de zonas
// (`ZoneGauge`). Por eso hay componentes nuevos en vez de ramas: el árbol es
// otro. `ImpactRow` e `ImpactBar` quedan intactos para la pantalla VIVA, que
// monta estos mismos archivos sin provider y cae a `classic`.
import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path } from 'react-native-svg'
import { useFijosSkin, type FijosNeoSkin } from '@/components/fijos/fijos-skin'
import { useAppTheme } from '@/theme/theme-provider'

/** Zonas del medidor, en los términos del handoff: sana ≤30%, media 30-50%,
 *  alta >50% del sueldo. NO son los umbrales viejos del `HealthBadge`
 *  (50/70): el medidor codifica 30/50 y el caption dice "límite sano 30%",
 *  así que en la piel neo mandan estos y la badge se alinea a ellos vía
 *  `zone`. La rama classic conserva sus cortes de siempre. */
export type ImpactZone = 'sana' | 'media' | 'alta'

export function zoneForPct(pct: number): ImpactZone {
  return pct > 50 ? 'alta' : pct > 30 ? 'media' : 'sana'
}

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

/** Columna ANTES o AHORA del bloque de impacto (sólo `neo`). La de la derecha
 *  alinea a la derecha; el ancho lo reparten con `flex:1`, así el par queda
 *  centrado sobre la flecha sin medir nada. */
function ImpactColumn({
  neo,
  align,
  label,
  labelInk,
  value,
  valueInk,
  valueSize,
  sub,
}: {
  neo: FijosNeoSkin
  align: 'left' | 'right'
  label: string
  labelInk: string
  value: string
  valueInk: string
  valueSize: number
  sub: React.ReactNode
}) {
  const textAlign = align
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={[
          styles.colLabel,
          { color: labelInk, fontFamily: neo.font('800'), textAlign },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.colValue,
          {
            color: valueInk,
            fontSize: valueSize,
            fontFamily: neo.font('900'),
            textAlign,
          },
        ]}
      >
        {value}
      </Text>
      {sub}
    </View>
  )
}

export interface ImpactColumnsProps {
  beforeLabel: string
  afterLabel: string
  beforeValue: string
  afterValue: string
  /** Ausentes cuando no hay sueldo con el que calcular el porcentaje. */
  beforePctText?: string
  afterPctText?: string
  deltaPctText?: string
}

export function ImpactColumns(props: ImpactColumnsProps) {
  const skin = useFijosSkin()
  if (skin.kind !== 'neo') return null
  const neo = skin
  const {
    beforeLabel,
    afterLabel,
    beforeValue,
    afterValue,
    beforePctText,
    afterPctText,
    deltaPctText,
  } = props
  return (
    <View style={styles.columns}>
      <ImpactColumn
        neo={neo}
        align="left"
        label={beforeLabel}
        labelInk={neo.faintInk}
        value={beforeValue}
        // El ANTES va de-enfatizado en tinta SUB aunque el peso sea 900: el
        // contraste lo hace el color, no el grosor. Así el AHORA gana sin
        // que el par pierda simetría tipográfica.
        valueInk={neo.mutedInk}
        valueSize={17}
        sub={
          beforePctText != null ? (
            <Text
              style={[
                styles.colSub,
                { color: neo.faintInk, fontFamily: neo.font('800'), textAlign: 'left' },
              ]}
            >
              {beforePctText}
            </Text>
          ) : null
        }
      />
      <View style={styles.arrow}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path
            d="M5 12h13M12 6l6 6-6 6"
            stroke={neo.faintInk}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
      <ImpactColumn
        neo={neo}
        align="right"
        label={afterLabel}
        labelInk={neo.add.accentGreen}
        value={afterValue}
        valueInk={neo.ink.title}
        valueSize={20}
        sub={
          afterPctText != null ? (
            // Porcentaje y delta en UNA línea: el `+1pp` es un modificador
            // del porcentaje, no un dato aparte. Nunito son faces estáticas
            // por peso, así que el <Text> anidado pisa familia junto al peso.
            <Text
              style={[
                styles.colSub,
                {
                  color: neo.add.accentGreen,
                  fontFamily: neo.font('900'),
                  fontWeight: '900',
                  textAlign: 'right',
                },
              ]}
            >
              {afterPctText}
              {deltaPctText != null ? (
                <Text
                  style={{
                    color: neo.add.accentClay,
                    fontFamily: neo.font('900'),
                    fontWeight: '900',
                  }}
                >
                  {' '}
                  {deltaPctText}
                </Text>
              ) : null}
            </Text>
          ) : null
        }
      />
    </View>
  )
}

/** Medidor de zonas: track de 9px con los tramos 30/20/50, dos ticks en los
 *  cortes y la perilla en el porcentaje actual. Reemplaza a `ImpactBar` en la
 *  piel neo — el handoff no dibuja ninguna barra dentro de la card de
 *  impacto, dibuja ésta dentro del bloque libre. */
export function ZoneGauge({ pct }: { pct: number }) {
  const skin = useFijosSkin()
  if (skin.kind !== 'neo') return null
  const g = skin.add.gauge
  const clamped = Math.max(0, Math.min(100, pct))
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
      <View
        style={[
          styles.gaugeKnob,
          {
            left: `${clamped}%`,
            marginLeft: -g.knob.width / 2,
            marginTop: -g.knob.height / 2,
            width: g.knob.width,
            height: g.knob.height,
            borderRadius: g.knob.radius,
            backgroundColor: g.knob.background,
            boxShadow: g.knob.shadow,
          },
        ]}
      />
    </View>
  )
}

export function HealthBadge({ pct, zone }: { pct: number; zone?: ImpactZone }) {
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const { t } = useTranslation()
  const tone: 'alto' | 'medio' | 'sano' = pct > 70 ? 'alto' : pct > 50 ? 'medio' : 'sano'
  if (skin.kind === 'neo') {
    // En neo la badge sigue el modelo del medidor (30/50), no sus cortes
    // viejos: badge y caption viven en el mismo bloque y decir "Sano" con la
    // perilla en el tramo ámbar sería contradecirse a 20px de distancia.
    const z = zone ?? zoneForPct(pct)
    const hb = skin.add.healthBadge
    const ok = z === 'sana'
    return (
      <View
        style={[
          styles.healthBadge,
          {
            borderRadius: hb.radius,
            paddingHorizontal: hb.padH,
            paddingVertical: hb.padV,
            backgroundColor: ok ? hb.okBackground : hb.warnBackground,
          },
        ]}
      >
        <Text
          style={[
            styles.healthBadgeText,
            {
              fontSize: hb.fontSize,
              fontWeight: '900',
              fontFamily: skin.font('900'),
              color: ok ? hb.okInk : hb.warnInk,
            },
          ]}
        >
          {z === 'alta'
            ? t('fijos:wizard.healthBadge.high')
            : z === 'media'
              ? t('fijos:wizard.healthBadge.mid')
              : t('fijos:wizard.healthBadge.healthy')}
        </Text>
      </View>
    )
  }
  // V1 health badge palette — alto/medio/sano = high/mid/healthy fijos
  // ratio. AA verified for fg-on-bg en ambos modos.
  const palette = theme.isDark
    ? {
        alto:  { bg: '#5C200A', fg: '#F8D1C3' },  // accent-900 / accent-200
        medio: { bg: '#7C2B0E', fg: '#FCEAE3' },  // accent-800 / accent-100
        sano:  { bg: '#244235', fg: '#A6EF8F' },  // surface-900 / primary-300
      }
    : {
        alto:  { bg: '#F8D1C3', fg: '#5C200A' },  // accent-200 / accent-900 — AAA
        medio: { bg: '#FCEAE3', fg: '#973511' },  // accent-100 / accent-700 — AA
        sano:  { bg: '#EAFBE4', fg: '#297811' },  // primary-100 / primary-800 — AA
      }
  const { bg, fg } = palette[tone]
  const label =
    tone === 'alto'
      ? t('fijos:wizard.healthBadge.high')
      : tone === 'medio'
        ? t('fijos:wizard.healthBadge.mid')
        : t('fijos:wizard.healthBadge.healthy')
  return (
    <View style={[styles.healthBadge, { backgroundColor: bg }]}>
      <Text style={[styles.healthBadgeText, { color: fg }]}>{label}</Text>
    </View>
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
  healthBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  healthBadgeText: { fontSize: 11, fontWeight: '800' },
  // ── neo ────────────────────────────────────────────────────────────────
  columns: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 13 },
  colLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.95 },
  colValue: { fontWeight: '900', marginTop: 2 },
  colSub: { fontSize: 11, fontWeight: '800' },
  arrow: { flexGrow: 0, flexShrink: 0 },
  // La perilla mide 17px sobre un track de 9: SOBRESALE 4px arriba y abajo.
  // El wrapper no puede clipear (por eso el `overflow:'hidden'` vive en el
  // track, no acá) y el bloque que lo contiene tiene que darle ese aire.
  gaugeWrap: { position: 'relative', marginTop: 12 },
  gaugeTrack: { flexDirection: 'row', overflow: 'hidden' },
  gaugeTick: { position: 'absolute', top: '50%' },
  gaugeKnob: { position: 'absolute', top: '50%' },
})
