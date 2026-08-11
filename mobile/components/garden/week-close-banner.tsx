import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { BrotMascot, type BrotPose } from '@/components/brot'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { GARDEN_GEOMETRY } from '@/components/redesign/garden/garden-spec'
import { cssGradient, neoMaterial, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import type { WeekClose } from '@/features/garden/garden-model'

interface WeekCloseBannerProps {
  weekClose: WeekClose
  onPress: () => void
}

/**
 * Brot que refleja cómo salió la semana. La semana perfecta es la del
 * mockup (`cheer`); las otras bajan por la misma escala de la copy, sin
 * salirse de las poses que el handoff le asigna al jardín.
 */
function poseForScore(score: number): BrotPose {
  if (score >= 7) return 'cheer'
  if (score >= 3) return 'idle'
  if (score >= 1) return 'seed'
  return 'zen'
}

/**
 * Banner de cierre de semana en Mi jardín (3g): card raised radio 24 con
 * el Brot a la izquierda y el CTA radial verde "Ver cierre ›" a la
 * derecha, que abre la celebración.
 */
function WeekCloseBannerImpl({ weekClose, onPress }: WeekCloseBannerProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()
  const ctaGradientCss = `radial-gradient(circle at 32% 28%, ${neo.ctaGradient[0]}, ${neo.ctaGradient[1]} 85%)`

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('garden:weekCloseBanner.a11y', {
        label: weekClose.label,
        score: weekClose.score,
      })}
      style={({ pressed }) => [
        styles.banner,
        neoMaterial(theme.mode, pressed && SUPPORTS_INSET_SHADOW ? 'insetSm' : 'raisedLg'),
        // Donde el inset no existe (Android < API 29) el press se marca
        // con la opacidad de siempre.
        pressed && !SUPPORTS_INSET_SHADOW ? styles.pressedFlat : null,
      ]}
    >
      <BrotMascot
        pose={poseForScore(weekClose.score)}
        size={GARDEN_GEOMETRY.headerBrotSize}
        shadow={false}
      />
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: neo.text }]}>{weekClose.label}</Text>
        <Text style={[styles.sub, { color: neo.textMuted }]}>
          {t('garden:weekCloseBanner.sub', { score: weekClose.score })}
        </Text>
      </View>
      <View
        style={[
          styles.cta,
          cssGradient(ctaGradientCss, neo.ctaGradient[1]),
          { boxShadow: neo.shadows.cta },
        ]}
      >
        <Text style={[styles.ctaLabel, { color: neo.ctaText }]}>
          {t('garden:weekCloseBanner.chip')}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: GARDEN_GEOMETRY.bannerRadius,
  },
  pressedFlat: {
    opacity: 0.82,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  sub: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 1,
  },
  cta: {
    borderRadius: neoRadii.chip,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  ctaLabel: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
})

export const WeekCloseBanner = memo(WeekCloseBannerImpl)
