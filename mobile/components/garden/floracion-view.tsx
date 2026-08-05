import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { triggerHaptic } from '@/lib/haptics'
import { CardParticles } from '@/components/ui/card-particles'
import { AuroraBloom } from '@/components/ui/aurora-bloom'
import { FernMark } from '@/components/billing/fern-mark'
import { CoralBloom } from '@/components/garden/coral-bloom'
import {
  AchievementIcon,
  hasAchievementIcon,
  ICON_CORAL,
  ICON_CORAL_SOFT,
  ICON_FOREST,
} from '@/components/achievements/achievement-icon'
import {
  FilledAchievementIcon,
  hasFilledAchievementIcon,
} from '@/components/achievements/achievement-icon-filled'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionSprings } from '@/lib/motion'
import { floracionToneForTier } from '@/features/garden/garden-tier'
import { achievementBody, achievementTitle } from '@/features/achievements/achievement-tiers'
import { cssGradient, neoParticlePresets, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import type { AchievementTierKey } from '@/features/garden/garden-tier'
import type { AchievementViewItem } from '@/features/achievements/use-achievements'

interface FloracionViewProps {
  /** Logro a celebrar. `null` mantiene la celebración oculta. */
  item: AchievementViewItem | null
  onDismiss: () => void
}

/**
 * Paleta ANCLADA a la rama OSCURA del rediseño, no a `useThemeTokens()`.
 * Mismo criterio (y mismo motivo) que `week-close-celebration`: es un
 * takeover global que aparece sobre cualquier tab y siempre fue oscuro en
 * los dos temas. Sobre el hero CLARO los niveles de texto del sistema
 * caen por debajo de AA, así que el ancla oscura preserva el momento Y el
 * contraste. Al ser constante, los estilos siguen siendo estáticos.
 */
const neo = neoTokens('dark')

/** Preset de partículas de celebración del handoff. */
const CELEBRATION_PARTICLES = neoParticlePresets.celebrationDark

/** CTA primario del rediseño: radial `circle at 32% 28%` + sombra `cta`. */
const CTA_GRADIENT_CSS = `radial-gradient(circle at 32% 28%, ${neo.ctaGradient[0]}, ${neo.ctaGradient[1]} 85%)`

/** Anillo del medallón: el durazno del sistema (`neo.warm`) al 55%. */
const MEDALLION_RING = 'rgba(242,168,126,0.55)'

/**
 * Acento del chip de tier en la escala neo.
 *
 * `floracionToneForTier()` (features/garden/garden-tier) sigue devolviendo
 * el acento V1 hardcodeado (#9FE08A / #B7DD8E / #CBD79F) — ese archivo
 * está FUERA de esta migración. Hasta que se migre, el mapeo de color vive
 * acá para no arrastrar lime fuera de paleta al takeover; la intensidad
 * (luciérnagas y flores) se sigue leyendo de `tone`.
 *
 * Contraste sobre el chip (tinte al 15% sobre el hero): green 8.3:1 ·
 * heroLabel 5.8:1 · textMuted 4.8:1.
 */
function chipAccentForTier(tier: AchievementTierKey): string {
  switch (tier) {
    case 'legendary':
    case 'gold':
      return neo.green
    case 'silver':
      return neo.heroLabel
    case 'bronze':
    default:
      return neo.textMuted
  }
}

/**
 * Celebración de hito "Floración". Reemplaza al AchievementUnlockModal feo por
 * un takeover full-screen sobre el hero verde del rediseño (familia del handoff
 * Frame 3): luciérnagas + medalla del logro con glow + flores coral que laten.
 * La intensidad escala con el tier del logro. Tap en cualquier lado o "Seguir
 * cultivando" cierra; auto-cierra a los 6s. Se monta en el
 * AchievementUnlockBridge (overlay absoluto sobre todo, no es un RN Modal).
 */
export function FloracionView({ item, onDismiss }: FloracionViewProps) {
  const reduced = useReducedMotion()
  const { t: translate } = useTranslation()
  const t = useSharedValue(0)
  const pop = useSharedValue(0.9)

  useEffect(() => {
    if (!item) return
    void triggerHaptic('success')
    if (reduced) {
      t.value = 1
      pop.value = 1
      return
    }
    t.value = 0
    pop.value = 0.9
    // @motion-allow: 420ms entrada del takeover de celebración (ease-out-expo).
    t.value = withTiming(1, { duration: 420, easing: Easing.bezier(0.16, 1, 0.3, 1) })
    pop.value = withDelay(120, withSpring(1, motionSprings.celebrate))
  }, [item, reduced, t, pop])

  useEffect(() => {
    if (!item) return
    const id = setTimeout(onDismiss, 6000)
    return () => clearTimeout(id)
  }, [item, onDismiss])

  const scrimStyle = useAnimatedStyle(() => ({ opacity: t.value }))
  const contentStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (1 - t.value) * 18 }, { scale: pop.value }],
  }))

  if (!item) return null
  const tone = floracionToneForTier(item.tier)

  return (
    <Animated.View pointerEvents="auto" style={[styles.scrim, scrimStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={translate('achievements:floracion.closeLabel')}
        onPress={onDismiss}
        style={StyleSheet.absoluteFill}
      />
      {/* Luciérnagas del preset de celebración (crema + verde + durazno),
          cantidad según tier. */}
      <CardParticles
        count={tone.particleCount}
        color={CELEBRATION_PARTICLES.colors[2]}
        accentColor={CELEBRATION_PARTICLES.colors[0]}
        peachColor={CELEBRATION_PARTICLES.colors[1]}
      />

      <Animated.View style={[styles.content, contentStyle]}>
        <View style={styles.fernWrap}>
          {/* El bloom tiene que ser MÁS CLARO que el hero para leerse como
              glow: `greenDeep` (#1F5429) queda por debajo del propio fondo
              y lo apagaría. El verde del CTA es el único forest del tema
              que sigue estando por encima del gradiente. */}
          <AuroraBloom color={neo.ctaGradient[1]} size={210} intensity={0.5} />
          {/* El ícono ÚNICO del hito en una medalla crema → cada celebración se
              siente distinta. Antes era el FernMark genérico (todas iguales por
              tier). Fallback al helecho para codes sin ícono custom. */}
          {hasFilledAchievementIcon(item.code) ? (
            <View style={styles.medallion}>
              <FilledAchievementIcon code={item.code} size={118} />
            </View>
          ) : hasAchievementIcon(item.code) ? (
            <View style={styles.medallion}>
              <AchievementIcon
                code={item.code}
                size={80}
                stroke={ICON_FOREST}
                accent={ICON_CORAL}
                accentSoft={ICON_CORAL_SOFT}
              />
            </View>
          ) : (
            <FernMark variant="cream" size={150} />
          )}
          {tone.blooms >= 1 && (
            <CoralBloom size={13} color={neo.warm} left="30%" top="24%" durationMs={11000} />
          )}
          {tone.blooms >= 2 && (
            <CoralBloom
              size={11}
              color={neo.warmBright}
              glow="0 0 10px 2px rgba(242,168,126,0.5)"
              left="62%"
              top="18%"
              durationMs={13500}
            />
          )}
        </View>

        <Text style={styles.eyebrow}>{translate('achievements:floracion.eyebrow')}</Text>
        <Text style={styles.title}>{achievementTitle(item.code, item.title)}</Text>
        <Text style={styles.body}>{achievementBody(item.code, item.body)}</Text>

        <View style={styles.chip}>
          <FernMark variant="mint" size={16} />
          <Text style={[styles.chipText, { color: chipAccentForTier(item.tier) }]}>
            {translate(`achievements:floracion.tier.${item.tier}`)}
          </Text>
        </View>

        <Pressable onPress={onDismiss} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>{translate('achievements:floracion.continue')}</Text>
        </Pressable>
        <Text style={styles.hint}>{translate('achievements:floracion.hint')}</Text>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Fondo de takeover del rediseño: hero verde oscuro de 3 stops
    // (150deg #234931 / #1B3A26 / #16301F) + fallback al stop medio.
    ...cssGradient(neo.heroGradientCss, neo.heroGradient[1]),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    paddingHorizontal: 30,
    overflow: 'hidden',
  },
  content: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  fernWrap: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    position: 'relative',
  },
  medallion: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: neo.text,
    alignItems: 'center',
    justifyContent: 'center',
    // El ícono relleno trae su fondo forest cuadrado → clip a círculo.
    // ⚠️ Este `overflow: 'hidden'` es LOAD-BEARING y además cambia la
    // regla: en iOS pone `masksToBounds`, que RECORTA la sombra del
    // propio layer. Por eso el anillo de 3px del handoff NO puede ir en
    // `boxShadow` acá (como sí hace `ringSelected`): se perdería en iOS
    // y, por debajo de API 28, también en Android. Queda como borde real
    // —misma geometría, el borde de RN es interior igual que antes— con
    // el durazno del sistema.
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: MEDALLION_RING,
    // Glow cálido sobre el hero (la aurora aporta el verde detrás). Es
    // decorativo: si el clip o el piso de Android se lo comen, el
    // medallón sigue separándose por su fill crema + el anillo.
    boxShadow: '0 0 22px rgba(242,168,126,0.45)',
  },
  eyebrow: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 2.2,
    color: neo.heroLabel,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.6,
    color: neo.text,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 33,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: nunitoFamily('400'),
    color: neo.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
  // Chip hundido con el tinte de estado del sistema (sin borde: el neo
  // hunde en vez de delinear).
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: neo.selectedTint,
    boxShadow: neo.shadows.insetSm,
    // El tinte es de sólo 15%: sin la sombra inset (Android < API 29) el
    // chip perdería todo límite, así que ahí cae a un hairline.
    borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
    borderColor: 'rgba(164,227,166,0.3)',
    borderRadius: neoRadii.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 20,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.8,
  },
  button: {
    width: '100%',
    height: 56,
    borderRadius: neoRadii.input,
    ...cssGradient(CTA_GRADIENT_CSS, neo.ctaGradient[1]),
    boxShadow: neo.shadows.cta,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    color: neo.ctaText,
  },
  hint: {
    fontSize: 12.5,
    fontFamily: nunitoFamily('400'),
    // `heroLabel`, no `textTertiary`: el nivel 4 da 3.7:1 sobre el hero
    // oscuro (antes #9FCB93 daba 6.9:1 sobre el scrim plano #163A1E).
    // heroLabel = 5.8:1 → AA.
    color: neo.heroLabel,
    textAlign: 'center',
    marginTop: 14,
  },
})
