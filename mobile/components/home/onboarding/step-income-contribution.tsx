import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AmountCard } from '@/components/home/amount-card'
import { RiseView } from '@/components/home/animated/rise-view'
import { parsePrice } from '@/utils/money'
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
  const parsed = parsePrice(monthlyIncomeRaw)
  const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          ¿Aportás al ingreso del hogar?
        </Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          Si tenés un sueldo o ingreso, lo sumamos al total de la familia. Si no
          (un hijo, pareja sin trabajo, etc), también está bien.
        </Text>
      </RiseView>

      <RiseView delay={80}>
        <View style={styles.choices}>
          <ChoicePill
            label="Sí, aporto"
            selected={contributesIncome === true}
            onPress={() => onChangeContributesIncome(true)}
            theme={theme}
          />
          <ChoicePill
            label="No aporto"
            selected={contributesIncome === false}
            onPress={() => onChangeContributesIncome(false)}
            theme={theme}
          />
        </View>
      </RiseView>

      {contributesIncome === true ? (
        <RiseView delay={140}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            TU INGRESO MENSUAL
          </Text>
          <View ref={amountCardRef}>
            <AmountCard
              amount={amount}
              isActive={isNumpadActive}
              onPress={onRequestNumpad}
              label="Tu sueldo mensual"
            />
          </View>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
            Se suma al ingreso total de la familia. Podés editarlo desde Ajustes
            cuando quieras.
          </Text>
        </RiseView>
      ) : null}

      {contributesIncome === false ? (
        <RiseView delay={140}>
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.infoText, { color: theme.colors.textMuted }]}>
              Listo — no se suma nada al ingreso del hogar. Si en algún momento
              empezás a aportar, podés activarlo desde Ajustes.
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

function ChoicePill({ label, selected, onPress, theme }: ChoicePillProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: selected
            ? theme.colors.primary
            : theme.colors.surface,
          borderColor: selected
            ? theme.colors.primary
            : theme.colors.border,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.choiceText,
          {
            color: selected
              ? theme.colors.surface
              : theme.colors.text,
          },
        ]}
      >
        {label}
      </Text>
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
  choice: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
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
    borderRadius: 14,
    borderWidth: 1,
  },
  infoText: { fontSize: 13, lineHeight: 18 },
})
