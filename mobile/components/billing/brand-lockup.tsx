import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { FernMark } from '@/components/billing/fern-mark'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { withAlpha } from '@/theme/color-utils'
import { neoInk } from '@/theme/neo-ink'
import { neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Ancla de marca: helecho + "Manifiesto" + badge del hogar. Es la misma fila
 * que abre la pantalla de planes (`auth-plan-hogar`), así que el badge usa su
 * receta: chip HUNDIDO con la tinta de acento. `tone` adapta las tintas a la
 * superficie — material neumórfico o hero forest.
 */
export interface BrandLockupProps {
  tone?: 'onCream' | 'onForest'
}

export const BrandLockup = memo(function BrandLockup({
  tone = 'onCream',
}: BrandLockupProps) {
  const mode = useThemeTokens().mode
  const neo = neoTokens(mode)
  const ink = neoInk(mode)
  const { t } = useTranslation()
  const onForest = tone === 'onForest'

  // Sobre el forest el pozo no existe (no hay material neumórfico debajo): el
  // badge se resuelve con el tinte menta del hero, como los chips de la hero
  // de Ajustes.
  const badgeStyle = useMemo<ViewStyle>(
    () =>
      onForest
        ? { backgroundColor: withAlpha(neo.heroGreen, 0.16) }
        : {
            backgroundColor: neo.well,
            boxShadow: neo.shadows.insetSm,
            ...(SUPPORTS_INSET_SHADOW
              ? null
              : { borderWidth: 1, borderColor: neo.sheetDivider }),
          },
    [onForest, neo],
  )

  return (
    <View style={styles.row}>
      <FernMark size={17} variant={onForest ? 'cream' : 'forest'} />
      <Text style={[styles.word, { color: onForest ? neo.heroText : neo.text }]}>
        Manifiesto
      </Text>
      <View style={[styles.badge, badgeStyle]}>
        <Text
          style={[
            styles.badgeText,
            { color: onForest ? neo.heroGreen : ink.accent },
          ]}
        >
          {t('billing:brand.tag')}
        </Text>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  word: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 0.3,
  },
  badge: {
    borderRadius: 9,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 1.47,
    textTransform: 'uppercase',
  },
})
