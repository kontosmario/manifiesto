// Badge de salud del bloque de impacto (alto / medio / sano). Extraído de
// `add-fijo-parts/impact-card.tsx`. Único cambio respecto del original: el
// copy entra por props (`labels`) en vez de resolverse con el namespace de
// fijos adentro — el kit no puede traducir por un flujo que no conoce. Los
// umbrales y los dos árboles (neo / classic) quedan literales.
import { StyleSheet, Text, View } from 'react-native'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

/** Zonas del medidor, en los términos del handoff: sana ≤30%, media 30-50%,
 *  alta >50% de la base. NO son los umbrales viejos de la rama classic
 *  (50/70): el medidor codifica 30/50 y el caption dice "límite sano 30%",
 *  así que en la piel neo mandan estos y la badge se alinea a ellos vía
 *  `zone`. La rama classic conserva sus cortes de siempre. */
export type ImpactZone = 'sana' | 'media' | 'alta'

export function zoneForPct(pct: number): ImpactZone {
  return pct > 50 ? 'alta' : pct > 30 ? 'media' : 'sana'
}

export interface HealthBadgeLabels {
  high: string
  mid: string
  healthy: string
}

export function HealthBadge({
  pct,
  zone,
  labels,
}: {
  pct: number
  /** Sólo `neo`: fuerza la zona en vez de derivarla (para que badge y medidor
   *  no se contradigan a 20px de distancia). */
  zone?: ImpactZone
  labels: HealthBadgeLabels
}) {
  const { theme } = useAppTheme()
  const skin = useWizardSkin()
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
          {z === 'alta' ? labels.high : z === 'media' ? labels.mid : labels.healthy}
        </Text>
      </View>
    )
  }
  // V1 health badge palette — alto/medio/sano = high/mid/healthy ratio.
  // AA verified for fg-on-bg en ambos modos.
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
  const label = tone === 'alto' ? labels.high : tone === 'medio' ? labels.mid : labels.healthy
  return (
    <View style={[styles.healthBadge, { backgroundColor: bg }]}>
      <Text style={[styles.healthBadgeText, { color: fg }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  healthBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  healthBadgeText: { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800') },
})
