import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { NumpadGrid } from '@/components/ui/numpad-grid'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import { motionDurations, motionEasings } from '@/lib/motion/tokens'
import { neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { formatMoney } from '@/utils/money'
import { WizardValueWell } from './wizard-value-well'

// CR Sprint D Minor #2: reuso del token central (misma curva que EXPO_OUT).
const EXPO_OUT = motionEasings.enterSmooth

export interface Step2AmountProps {
  goalAmount: number
  goalAmountRaw: string
  onChangeRawValue: (v: string) => void
  numpadExpanded: boolean
  onExpandNumpad: () => void
  reduceMotion: boolean
  onDone: () => void
}

export function Step2Amount({
  goalAmount,
  goalAmountRaw,
  onChangeRawValue,
  numpadExpanded,
  onExpandNumpad,
  reduceMotion,
  onDone,
}: Step2AmountProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const skin = useWizardSkin()
  // El escalón apagado que SÍ llega a AA sobre la hoja: `textMuted` da
  // 3.89:1 y esta línea explica cómo se edita el monto.
  const helperInk = skin.kind === 'neo' ? skin.mutedInkStrong : neo.textMuted
  const { t } = useTranslation()
  const amountSpoken = goalAmount > 0 ? formatMoney(goalAmount) : t('settings:savingsWizard.undefined')
  return (
    <View style={styles.step2Body}>
      <WizardValueWell
        label={t('settings:savingsWizard.targetAmountEyebrow')}
        value={goalAmount > 0 ? formatMoney(goalAmount) : '$ 0'}
        placeholder={goalAmount <= 0}
        expanded={numpadExpanded}
        onPress={onExpandNumpad}
        accessibilityLabel={
          numpadExpanded
            ? t('settings:savingsWizard.editAmountA11y', { amount: amountSpoken })
            : t('settings:savingsWizard.tapEditAmountA11y', { amount: amountSpoken })
        }
      />

      {!numpadExpanded ? (
        <Text style={[styles.amountHelper, { color: helperInk }]}>
          {t('settings:savingsWizard.amountHelper')}
        </Text>
      ) : null}

      {numpadExpanded ? (
        <Animated.View
          entering={
            reduceMotion
              ? FadeIn.duration(motionDurations.micro)
              : SlideInDown.duration(motionDurations.deliberate).easing(EXPO_OUT)
          }
          exiting={
            reduceMotion
              ? FadeOut.duration(motionDurations.micro)
              : SlideOutDown.duration(motionDurations.exitModal).easing(EXPO_OUT)
          }
        >
          <NumpadGrid
            rawValue={goalAmountRaw}
            onChangeRawValue={onChangeRawValue}
            onDone={onDone}
            hideDoneButton
            maxIntegerDigits={11}
          />
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  step2Body: {
    gap: 12,
  },
  amountHelper: {
    paddingHorizontal: 4,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 17,
  },
})
