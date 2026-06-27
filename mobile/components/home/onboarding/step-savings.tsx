import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { AmountCard } from '@/components/home/amount-card'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
// Reusamos los mismos constantes que el wizard de creación de meta de Settings
// para que onboarding y Settings queden sincronizados (un solo source of truth).
import { GOAL_EXTRA_ICONS } from '@/components/savings-goals/wizard-steps/step-1-title-emoji'
import { GoalIcon } from '@/components/savings-goals/goal-icon'
import { GOAL_STICKER_KEYS } from '@/features/savings-goals/goal-icon'
import { MONTH_OPTIONS } from '@/components/savings-goals/wizard-steps/step-3-months'
import { TextField } from '@/components/ui/text-field'
import { usePressScale } from '@/hooks/use-press-scale'
import { formatMoney, parsePrice } from '@/utils/money'
import { triggerHaptic } from '@/lib/haptics'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface StepSavingsProps {
  monthlyIncome: number
  savingsGoalPercent: number
  createFirstGoal: boolean
  firstGoalTitle: string
  firstGoalEmoji: string
  firstGoalTargetRaw: string
  firstGoalMonths: number
  onChangeSavingsPercent: (value: number) => void
  onToggleCreateFirstGoal: (value: boolean) => void
  onChangeFirstGoalTitle: (value: string) => void
  onChangeFirstGoalEmoji: (value: string) => void
  onRequestFirstGoalNumpad: () => void
  onChangeFirstGoalMonths: (value: number) => void
  /** True while the InAppNumpad is open editing the goal amount.
   *  Drives the AmountCard's focus border animation. */
  isGoalNumpadActive?: boolean
  /** Callback ref for the goal AmountCard wrapper. Parent uses it
   *  to scroll the card into view when its numpad opens — the goal
   *  card lives mid-form so it'd otherwise be hidden by the sheet. */
  amountCardRef?: (node: View | null) => void
}

const PERCENT_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 40] as const

export function StepSavings({
  monthlyIncome,
  savingsGoalPercent,
  createFirstGoal,
  firstGoalTitle,
  firstGoalEmoji,
  firstGoalTargetRaw,
  firstGoalMonths,
  onChangeSavingsPercent,
  onToggleCreateFirstGoal,
  onChangeFirstGoalTitle,
  onChangeFirstGoalEmoji,
  onRequestFirstGoalNumpad,
  onChangeFirstGoalMonths,
  isGoalNumpadActive = false,
  amountCardRef,
}: StepSavingsProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const targetAmount = monthlyIncome * (savingsGoalPercent / 100)
  const parsedGoal = parsePrice(firstGoalTargetRaw)
  const goalAmount = Number.isFinite(parsedGoal) && parsedGoal > 0 ? parsedGoal : 0

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {t('onboarding:savings.title')}
        </Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          {t('onboarding:savings.subcopy')}
        </Text>
      </RiseView>

      <RiseView delay={80}>
        <View
          style={[
            styles.percentCard,
            { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
          ]}
        >
          <View style={styles.percentHeader}>
            <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
              {t('onboarding:savings.percentEyebrow')}
            </Text>
            <Text style={[styles.percentValue, { color: theme.colors.text }]}>
              {savingsGoalPercent}%
            </Text>
          </View>
          <View style={styles.percentChips}>
            {PERCENT_OPTIONS.map((p) => (
              <PercentChip
                key={p}
                percent={p}
                selected={savingsGoalPercent === p}
                onPress={() => {
                  void triggerHaptic('selection')
                  onChangeSavingsPercent(p)
                }}
                theme={theme}
              />
            ))}
          </View>
          {monthlyIncome > 0 ? (
            savingsGoalPercent > 0 ? (
              <View style={styles.hintRow}>
                <Text style={[styles.percentHint, { color: theme.colors.textMuted }]}>
                  {t('onboarding:savings.savePrefix')}
                </Text>
                <CountUpText
                  value={targetAmount}
                  format={formatMoney}
                  duration={500}
                  style={[styles.hintStrong, { color: theme.colors.primary }]}
                />
                <Text style={[styles.percentHint, { color: theme.colors.textMuted }]}>
                  {t('onboarding:savings.savePerMonth')}
                </Text>
              </View>
            ) : (
              <Text style={[styles.percentHint, { color: theme.colors.textMuted }]}>
                {t('onboarding:savings.noAutoSavings')}
              </Text>
            )
          ) : (
            <Text style={[styles.percentHint, { color: theme.colors.textMuted }]}>
              {t('onboarding:savings.enterIncomeFirst')}
            </Text>
          )}
        </View>
      </RiseView>

      <RiseView delay={140}>
        <Pressable
          onPress={() => {
            void triggerHaptic('selection')
            onToggleCreateFirstGoal(!createFirstGoal)
          }}
          style={[
            styles.toggleRow,
            {
              backgroundColor: createFirstGoal
                ? theme.colors.primarySurface
                : theme.colors.creamCard,
              borderColor: createFirstGoal
                ? theme.colors.primary
                : theme.colors.line,
            },
          ]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: createFirstGoal }}
          accessibilityLabel={t('onboarding:savings.createGoalA11y')}
        >
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: createFirstGoal ? theme.colors.primary : 'transparent',
                borderColor: createFirstGoal ? theme.colors.primary : theme.colors.line,
              },
            ]}
          >
            {createFirstGoal ? (
              <MaterialIcons name="check" size={16} color={theme.colors.textOnPrimary} />
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleTitle, { color: theme.colors.text }]}>
              {t('onboarding:savings.createGoalTitle')}
            </Text>
            <Text style={[styles.toggleMeta, { color: theme.colors.textMuted }]}>
              {t('onboarding:savings.createGoalMeta')}
            </Text>
          </View>
        </Pressable>
      </RiseView>

      {createFirstGoal ? (
        <Animated.View
          key="goal-form"
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(140)}
          layout={LinearTransition.duration(240)}
          style={styles.goalForm}
        >
          <TextField
            label={t('onboarding:savings.goalTitleLabel')}
            value={firstGoalTitle}
            onChangeText={onChangeFirstGoalTitle}
            placeholder={t('onboarding:savings.goalTitlePlaceholder')}
            maxLength={40}
            accessibilityLabel={t('onboarding:savings.goalTitleA11y')}
          />

          {/* Íconos de meta (stickers) — mismo set que el wizard de Settings. */}
          <View style={styles.emojiSection}>
            <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
              {t('onboarding:savings.iconEyebrow')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.emojiScroll}
              contentContainerStyle={styles.emojiScrollContent}
              accessibilityLabel={t('onboarding:savings.iconScrollA11y')}
            >
              {[...GOAL_STICKER_KEYS, ...GOAL_EXTRA_ICONS].map((value) => {
                const on = value === firstGoalEmoji
                return (
                  <Pressable
                    key={value}
                    onPress={() => {
                      void triggerHaptic('selection')
                      onChangeFirstGoalEmoji(value)
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t('onboarding:savings.iconItemA11y', { glyph: value })}
                    style={[
                      styles.emojiCard,
                      {
                        backgroundColor: on
                          ? theme.colors.primarySurface
                          : theme.colors.creamSoft,
                        borderColor: on ? theme.colors.primary : theme.colors.line,
                        borderWidth: on ? 2 : 1,
                      },
                    ]}
                  >
                    <GoalIcon value={value} size={28} emojiStyle={styles.emojiGlyph} />
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>

          <View ref={amountCardRef}>
            <AmountCard
              amount={goalAmount}
              isActive={isGoalNumpadActive}
              onPress={onRequestFirstGoalNumpad}
              label={t('onboarding:savings.amountLabel')}
            />
          </View>

          {/* Plazo — mismos presets que el wizard de Settings (MONTH_OPTIONS). */}
          <View>
            <Text style={[styles.eyebrow, { color: theme.colors.textMuted, marginBottom: 6 }]}>
              {t('onboarding:savings.monthsEyebrow')}
            </Text>
            <View style={styles.monthsChips}>
              {MONTH_OPTIONS.map((m) => (
                <MonthChip
                  key={m}
                  months={m}
                  selected={firstGoalMonths === m}
                  onPress={() => {
                    void triggerHaptic('selection')
                    onChangeFirstGoalMonths(m)
                  }}
                  theme={theme}
                />
              ))}
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  )
}

interface PercentChipProps {
  percent: number
  selected: boolean
  onPress: () => void
  theme: ReturnType<typeof useAppTheme>['theme']
}

function PercentChip({ percent, selected, onPress, theme }: PercentChipProps) {
  const press = usePressScale({ pressedScale: 0.98 })
  const { t } = useTranslation()
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={t('onboarding:savings.percentA11y', { percent })}
    >
      <Animated.View
        style={[
          styles.percentChip,
          press.animatedStyle,
          {
            backgroundColor: selected
              ? theme.colors.primarySurface
              : theme.colors.creamSoft,
            borderColor: selected ? theme.colors.primary : theme.colors.line,
          },
        ]}
      >
        <Text
          style={[
            styles.percentChipText,
            { color: selected ? theme.colors.primary : theme.colors.text },
          ]}
        >
          {percent}%
        </Text>
      </Animated.View>
    </Pressable>
  )
}

interface MonthChipProps {
  months: number
  selected: boolean
  onPress: () => void
  theme: ReturnType<typeof useAppTheme>['theme']
}

function MonthChip({ months, selected, onPress, theme }: MonthChipProps) {
  const press = usePressScale({ pressedScale: 0.98 })
  const { t } = useTranslation()
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={t('onboarding:savings.monthsA11y', { count: months })}
      style={styles.monthChipWrap}
    >
      <Animated.View
        style={[
          styles.monthChip,
          press.animatedStyle,
          {
            backgroundColor: selected
              ? theme.colors.primarySurface
              : theme.colors.creamSoft,
            borderColor: selected ? theme.colors.primary : theme.colors.line,
          },
        ]}
      >
        <Text
          style={[
            styles.monthChipText,
            { color: selected ? theme.colors.primary : theme.colors.text },
          ]}
        >
          {t('onboarding:savings.monthsChip', { count: months })}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  subcopy: { fontSize: 13, marginTop: 4 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  percentCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: 10,
  },
  percentHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  percentValue: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  percentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  percentChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  percentChipText: { fontSize: 12, fontWeight: '700' },
  percentHint: { fontSize: 12, marginTop: 2 },
  hintRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  hintStrong: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTitle: { fontSize: 14, fontWeight: '800' },
  toggleMeta: { fontSize: 12, marginTop: 2 },
  goalForm: { gap: 12 },
  emojiSection: { gap: 10 },
  emojiScroll: { flexGrow: 0 },
  emojiScrollContent: { gap: 8, paddingVertical: 2, paddingHorizontal: 2 },
  emojiCard: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGlyph: { fontSize: 24 },
  monthsChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthChipWrap: {
    flexGrow: 1,
    flexBasis: '47%',
  },
  monthChip: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthChipText: { fontSize: 14, fontWeight: '700' },
})
