import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { AmountCard } from '@/components/home/amount-card'
import { RiseView } from '@/components/home/animated/rise-view'
import { usePressScale } from '@/hooks/use-press-scale'
import { parsePrice } from '@/utils/money'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface StepIncomeContributionProps {
  contributesIncome: boolean | null
  monthlyIncomeRaw: string
  onChangeContributesIncome: (value: boolean) => void
  onRequestNumpad: () => void
  isNumpadActive?: boolean
  amountCardRef?: (node: View | null) => void
}

/**
 * Step 4 for the joiner flow. Replaces `StepIncome` (which captures
 * the household salary day) with a contribution toggle + optional
 * amount. The joiner doesn't set the household's salary day or
 * savings percent — those belong to the family's existing finance
 * record set by the creator. Only the joiner's personal monthly
 * contribution to the household total is captured here.
 */
export function StepIncomeContribution({
  contributesIncome,
  monthlyIncomeRaw,
  onChangeContributesIncome,
  onRequestNumpad,
  isNumpadActive = false,
  amountCardRef,
}: StepIncomeContributionProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const parsed = parsePrice(monthlyIncomeRaw)
  const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {t('onboarding:incomeContribution.title')}
        </Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          {t('onboarding:incomeContribution.subcopy')}
        </Text>
      </RiseView>

      <RiseView delay={80}>
        <View style={styles.choices}>
          <ChoicePill
            label={t('onboarding:incomeContribution.yes')}
            selected={contributesIncome === true}
            onPress={() => onChangeContributesIncome(true)}
            theme={theme}
          />
          <ChoicePill
            label={t('onboarding:incomeContribution.no')}
            selected={contributesIncome === false}
            onPress={() => onChangeContributesIncome(false)}
            theme={theme}
          />
        </View>
      </RiseView>

      {contributesIncome === true ? (
        <RiseView delay={140}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            {t('onboarding:incomeContribution.incomeEyebrow')}
          </Text>
          <View ref={amountCardRef}>
            <AmountCard
              amount={amount}
              isActive={isNumpadActive}
              onPress={onRequestNumpad}
              label={t('onboarding:incomeContribution.amountLabel')}
            />
          </View>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
            {t('onboarding:incomeContribution.hintContributes')}
          </Text>
        </RiseView>
      ) : null}

      {contributesIncome === false ? (
        <RiseView delay={140}>
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: theme.colors.creamCard,
                borderColor: theme.colors.line,
              },
            ]}
          >
            <Text style={[styles.infoText, { color: theme.colors.textMuted }]}>
              {t('onboarding:incomeContribution.infoNoContribute')}
            </Text>
          </View>
        </RiseView>
      ) : null}
    </View>
  )
}

interface ChoicePillProps {
  label: string
  selected: boolean
  onPress: () => void
  theme: ReturnType<typeof useAppTheme>['theme']
}

/** Pill de opción del onboarding — también la usa `StepIncome` para el
 *  selector de régimen de ingreso (fijo / variable). */
export function ChoicePill({ label, selected, onPress, theme }: ChoicePillProps) {
  const press = usePressScale({ pressedScale: 0.98 })
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={styles.choiceWrap}
    >
      <Animated.View
        style={[
          styles.choice,
          press.animatedStyle,
          {
            backgroundColor: selected
              ? theme.colors.primarySurface
              : theme.colors.creamCard,
            borderColor: selected
              ? theme.colors.primary
              : theme.colors.line,
          },
        ]}
      >
        <Text
          style={[
            styles.choiceText,
            {
              color: selected
                ? theme.colors.primary
                : theme.colors.text,
            },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  subcopy: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  choices: {
    flexDirection: 'row',
    gap: 10,
  },
  choiceWrap: { flex: 1 },
  choice: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  choiceText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 8,
  },
  hint: { marginTop: 10, fontSize: 12, lineHeight: 17 },
  infoCard: {
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  infoText: { fontSize: 13, lineHeight: 18 },
})
