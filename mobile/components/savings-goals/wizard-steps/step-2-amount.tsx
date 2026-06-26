import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { NumpadGrid } from '@/components/ui/numpad-grid'
import { motionEasings } from '@/lib/motion/tokens'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney } from '@/utils/money'

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
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const isPlaceholder = goalAmount <= 0
  const amountSpoken = goalAmount > 0 ? formatMoney(goalAmount) : t('settings:savingsWizard.undefined')
  return (
    <View style={styles.step2Body}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          numpadExpanded
            ? t('settings:savingsWizard.editAmountA11y', { amount: amountSpoken })
            : t('settings:savingsWizard.tapEditAmountA11y', { amount: amountSpoken })
        }
        accessibilityState={{ expanded: numpadExpanded }}
        onPress={() => {
          if (!numpadExpanded) onExpandNumpad()
        }}
        style={({ pressed }) => [
          styles.displayCard,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
            opacity: pressed && !numpadExpanded ? 0.85 : 1,
          },
        ]}
      >
        <Text
          style={[
            typography.eyebrow,
            styles.displayEyebrow,
            { color: theme.colors.textMuted },
          ]}
        >
          {t('settings:savingsWizard.targetAmountEyebrow')}
        </Text>
        <View style={styles.displayValueRow}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            allowFontScaling
            maxFontSizeMultiplier={1.2}
            style={[
              typography.displayLarge,
              styles.displayValue,
              {
                color: isPlaceholder
                  ? theme.colors.textSoft
                  : theme.colors.text,
              },
            ]}
          >
            {goalAmount > 0 ? formatMoney(goalAmount) : '$ 0'}
          </Text>
          {!numpadExpanded ? (
            <View
              style={[
                styles.displayEditChip,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <MaterialIcons
                name="edit"
                size={14}
                color={theme.colors.textMuted}
              />
              <Text
                style={[
                  styles.displayEditChipText,
                  { color: theme.colors.textMuted },
                ]}
              >
                {t('common:actions.edit')}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      {!numpadExpanded ? (
        <Text
          style={[
            styles.amountHelper,
            { color: theme.colors.textMuted },
          ]}
        >
          {t('settings:savingsWizard.amountHelper')}
        </Text>
      ) : null}

      {numpadExpanded ? (
        <Animated.View
          entering={
            reduceMotion
              ? FadeIn.duration(120)
              : SlideInDown.duration(320).easing(EXPO_OUT)
          }
          exiting={
            reduceMotion
              ? FadeOut.duration(120)
              : SlideOutDown.duration(220).easing(EXPO_OUT)
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
  displayCard: {
    borderRadius: radii['2xl'],
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 6,
  },
  displayEyebrow: {
    letterSpacing: 1.4,
  },
  displayValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  displayValue: {
    flex: 1,
    letterSpacing: -1.2,
  },
  displayEditChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  displayEditChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  amountHelper: {
    paddingHorizontal: 4,
    fontSize: 12,
    fontWeight: '500',
  },
})
