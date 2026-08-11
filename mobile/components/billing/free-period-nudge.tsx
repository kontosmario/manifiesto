import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { RiseView } from '@/components/home/animated/rise-view'
import { HOME_SPEC, type HomeMode } from '@/components/redesign/home/home-spec'
import { triggerHaptic } from '@/lib/haptics'
import {
  cssGradient,
  neoMaterial,
  neoRadii,
  neoTokens,
  pastelDark,
} from '@/theme/neo-tokens'
import { useThemeMode } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

/**
 * Recordatorio del período libre en Home. Banda raise del vocabulario neo
 * (material `raisedMd` + tile tintado + pill verde del catálogo), alineada con
 * las cards vecinas. Informativo — NUNCA dice "prueba/gratis". Dismissible por
 * sesión; el gate de cuándo mostrarlo lo decide el host (Home).
 *
 * ACENTO DE AVISO (owner 2026-08-08). Antes el acento cálido sólo aparecía con
 * `daysLeft <= 2`: a 4 días la card salía verde de punta a punta —tile
 * `selectedTint`, ícono `accent`— y se leía igual que cualquier card
 * informativa de la Home, sin decir que algo se está terminando. Pero el host
 * ya sólo la monta con **7 días o menos**: toda la ventana en la que existe ES
 * la ventana de aviso. Así que el acento cálido va SIEMPRE y lo que escala con
 * `urgent` es la intensidad, no su presencia.
 *
 * Los colores son la rampa del token `warm` del sistema (hue 21 en claro, 22
 * en oscuro), no un naranja nuevo: paradas 500/600/700 en claro y 500/400/300
 * en oscuro.
 *
 * Medidos contra los DOS stops del degradé `raisedGradient` —que es la
 * superficie real de la card, no la hoja plana— y en los dos niveles de
 * intensidad. Peores casos:
 *   · claro  — ícono #834625 sobre el tile 4.30:1 · borde #9F552D 4.27:1
 *   · oscuro — ícono #EEB290 sobre el tile 5.22:1 · borde #E98953 5.20:1
 * El ícono es objeto gráfico (3:1) y el borde componente de UI (3:1): los dos
 * pasan con margen en las cuatro combinaciones.
 *
 * El borde va en el color SÓLIDO y no en alfa: mezclado al 40% caía a 1.74:1
 * y dejaba de leerse como aviso, que es justo su trabajo.
 */
const WARN = {
  light: { ramp: '#BF6636', icon: '#834625', border: '#9F552D' },
  dark: { ramp: '#DE5F16', icon: '#EEB290', border: '#E98953' },
} as const

export interface FreePeriodNudgeProps {
  daysLeft: number
  onSeePlans: () => void
}

export const FreePeriodNudge = memo(function FreePeriodNudge({
  daysLeft,
  onSeePlans,
}: FreePeriodNudgeProps) {
  const mode = useThemeMode().resolvedMode as HomeMode
  const neo = neoTokens(mode)
  const s = HOME_SPEC[mode]
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const urgent = daysLeft <= 2
  const title = urgent
    ? t('billing:nudge.titleUrgent')
    : t('billing:nudge.title', { count: daysLeft })
  const subtitle = urgent
    ? t('billing:nudge.subtitleUrgent')
    : t('billing:nudge.subtitle')
  const ctaLabel = urgent
    ? t('billing:nudge.ctaSubscribe')
    : t('billing:nudge.ctaSeePlans')

  const handleCta = () => {
    void triggerHaptic('selection')
    onSeePlans()
  }
  const handleDismiss = () => {
    void triggerHaptic('selection')
    setDismissed(true)
  }

  // El literal oscuro del spec (`ctaGreenPillInk` #2E7C39 sobre el pill crema)
  // queda en 3.85:1, bajo AA para un label de 11pt; `greenDeep` es el mismo
  // verde del sistema una parada más abajo y llega a 6.6:1.
  const ctaInk = mode === 'dark' ? neo.greenDeep : s.ctaGreenPillInk

  const warn = WARN[mode]

  return (
    <RiseView>
      <View
        style={[
          neoMaterial(mode, 'raisedMd'),
          styles.card,
          {
            borderRadius: neoRadii.pill,
            // El aro de aviso reemplaza al `sheetDivider` que sólo existía como
            // fallback de Android viejo: acá es semántico, no un parche.
            borderWidth: urgent ? 1.5 : 1,
            borderColor: warn.border,
          },
        ]}
      >
        <View style={styles.inner}>
          <View
            style={[
              styles.icon,
              // El tile es el mismo naranja de la rampa sobre la hoja; sube de
              // 16% a 26% con la urgencia (20%→30% en oscuro, que necesita más
              // mezcla para despegarse de una superficie oscura).
              {
                backgroundColor: pastelDark(
                  warn.ramp,
                  mode === 'dark' ? (urgent ? 0.3 : 0.2) : urgent ? 0.26 : 0.16,
                ),
              },
            ]}
          >
            {/* Reloj, no candado: `lock-open` decía "tenés acceso", que es lo
                contrario de lo que la card vino a avisar. Lo que se está
                terminando es el TIEMPO. */}
            <MaterialIcons name="schedule" size={16} color={warn.icon} />
          </View>
          <View style={styles.txt}>
            <Text style={[styles.t1, { color: neo.text }]}>{title}</Text>
            <Text style={[styles.t2, { color: neo.textMuted }]}>
              {subtitle}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
            onPress={handleCta}
            hitSlop={8}
          >
            <View
              style={[
                styles.cta,
                cssGradient(s.ctaGreenPillGradientCss, neo.green),
                { boxShadow: neo.shadows.cta },
              ]}
            >
              <Text style={[styles.ctaText, { color: ctaInk }]}>{ctaLabel}</Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('billing:nudge.close')}
            onPress={handleDismiss}
            hitSlop={10}
            style={styles.close}
          >
            <MaterialIcons name="close" size={16} color={neo.textMuted} />
          </Pressable>
        </View>
      </View>
    </RiseView>
  )
})

const styles = StyleSheet.create({
  /**
   * Aire con lo que sigue. La card se monta ARRIBA del header de la Home y no
   * traía ninguno: el saludo quedaba pegado al borde de abajo y el halo claro
   * del relieve neumórfico se le montaba encima. 18 es el mismo escalón que
   * usan las secciones de la Home entre bloques.
   */
  card: { marginBottom: 18 },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: neoRadii.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txt: { flex: 1 },
  t1: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
  },
  t2: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
    marginTop: 1,
  },
  cta: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
  ctaText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
  },
  close: { padding: 2 },
})
