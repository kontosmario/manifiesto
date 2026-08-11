import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import { neoInk } from '@/theme/neo-ink'
import { cssGradient, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { formatMoney } from '@/utils/money'
import { GoalIcon } from '../goal-icon'

export interface StepSummaryProps {
  emoji: string
  title: string
  goalAmount: number
  months: number
  monthlyEstimate: number
  suggestedApply: number | null
}

/**
 * Resumen del wizard: card ELEVADA (`raisedGradientCss` + `raisedMd`) — es
 * el único bloque del flujo que no se hunde, porque no se edita: se lee.
 * La nota del aporte automático es un pozo tintado, el recurso del sistema
 * para "esto va a pasar solo".
 */
export function StepSummary({
  emoji,
  title,
  goalAmount,
  months,
  monthlyEstimate,
  suggestedApply,
}: StepSummaryProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)
  const skin = useWizardSkin()
  // `textMuted` da 3.49:1 sobre el gradiente de card; el escalón apagado
  // FUERTE del sistema llega a 5.9:1 claro / 7.4:1 oscuro.
  const subInk = skin.kind === 'neo' ? skin.mutedInkStrong : neo.textMuted
  const { t } = useTranslation()
  return (
    <View style={styles.step4Body}>
      <View
        style={[
          styles.summaryCard,
          cssGradient(neo.raisedGradientCss, neo.surface),
          { boxShadow: neo.shadows.raisedMd },
        ]}
      >
        <GoalIcon value={emoji} size={56} emojiStyle={styles.summaryEmoji} />
        <Text
          style={[styles.summaryTitle, { color: neo.text }]}
          numberOfLines={2}
        >
          {title || t('settings:savingsWizard.defaultTitle')}
        </Text>
        <Text
          style={[styles.summaryAmount, { color: neo.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatMoney(goalAmount)}
        </Text>
        <Text style={[styles.summarySub, { color: subInk }]}>
          {t('settings:savingsWizard.summarySub', {
            amount: formatMoney(monthlyEstimate),
            months: t('settings:savingsWizard.monthsValue', { count: months }),
          })}
        </Text>
      </View>

      {suggestedApply ? (
        <View
          style={[
            styles.summaryApply,
            {
              backgroundColor: neo.selectedTint,
              boxShadow: neo.shadows.insetSm,
              borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
              borderColor: neo.sheetDivider,
            },
          ]}
        >
          <MaterialIcons name="bolt" size={16} color={ink.accent} />
          <Text style={[styles.summaryApplyText, { color: ink.accent }]}>
            {t('settings:savingsWizard.applyNote', { amount: formatMoney(suggestedApply) })}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  step4Body: {
    gap: 12,
  },
  summaryCard: {
    borderRadius: neoRadii.card,
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 6,
  },
  summaryEmoji: {
    fontSize: 48,
    lineHeight: 56,
    marginBottom: 4,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  summaryAmount: {
    fontSize: 38,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -1.4,
    marginTop: 4,
  },
  summarySub: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    marginTop: 4,
  },
  summaryApply: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: neoRadii.tile,
  },
  summaryApplyText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 0.1,
  },
})
