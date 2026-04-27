import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { AmountCard } from '@/components/home/amount-card'
import { RiseView } from '@/components/home/animated/rise-view'
import { TextField } from '@/components/ui/text-field'
import { formatMoney, parsePrice } from '@/utils/money'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

interface StepSavingsProps {
  monthlyIncome: number
  savingsGoalPercent: number
  createFirstGoal: boolean
  firstGoalTitle: string
  firstGoalTargetRaw: string
  firstGoalMonths: number
  onChangeSavingsPercent: (value: number) => void
  onToggleCreateFirstGoal: (value: boolean) => void
  onChangeFirstGoalTitle: (value: string) => void
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
  firstGoalTargetRaw,
  firstGoalMonths,
  onChangeSavingsPercent,
  onToggleCreateFirstGoal,
  onChangeFirstGoalTitle,
  onRequestFirstGoalNumpad,
  onChangeFirstGoalMonths,
  isGoalNumpadActive = false,
  amountCardRef,
}: StepSavingsProps) {
  const { theme } = useAppTheme()
  const targetAmount = monthlyIncome * (savingsGoalPercent / 100)
  const parsedGoal = parsePrice(firstGoalTargetRaw)
  const goalAmount = Number.isFinite(parsedGoal) && parsedGoal > 0 ? parsedGoal : 0

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          ¿Querés arrancar con una meta?
        </Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          Podés agregarla después si preferís.
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
              % DEL SUELDO A AHORRAR
            </Text>
            <Text style={[styles.percentValue, { color: theme.colors.text }]}>
              {savingsGoalPercent}%
            </Text>
          </View>
          <View style={styles.percentChips}>
            {PERCENT_OPTIONS.map((p) => {
              const on = savingsGoalPercent === p
              return (
                <Pressable
                  key={p}
                  onPress={() => {
                    void triggerHaptic('selection')
                    onChangeSavingsPercent(p)
                  }}
                  style={[
                    styles.percentChip,
                    {
                      backgroundColor: on ? theme.colors.text : theme.colors.creamSoft,
                      borderColor: on ? theme.colors.text : theme.colors.line,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${p} por ciento`}
                >
                  <Text
                    style={[
                      styles.percentChipText,
                      { color: on ? theme.colors.creamCard : theme.colors.text },
                    ]}
                  >
                    {p}%
                  </Text>
                </Pressable>
              )
            })}
          </View>
          {monthlyIncome > 0 ? (
            <Text style={[styles.percentHint, { color: theme.colors.textMuted }]}>
              {savingsGoalPercent > 0
                ? `≈ ${formatMoney(targetAmount)} por mes`
                : 'Sin ahorro automático — lo podés activar luego.'}
            </Text>
          ) : (
            <Text style={[styles.percentHint, { color: theme.colors.textMuted }]}>
              Ingresá tu sueldo en el paso anterior para ver el equivalente.
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
            { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
          ]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: createFirstGoal }}
          accessibilityLabel="Crear mi primera meta ahora"
        >
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: createFirstGoal ? theme.colors.text : 'transparent',
                borderColor: createFirstGoal ? theme.colors.text : theme.colors.line,
              },
            ]}
          >
            {createFirstGoal ? (
              <MaterialIcons name="check" size={16} color={theme.colors.creamCard} />
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleTitle, { color: theme.colors.text }]}>
              Crear mi primera meta ahora
            </Text>
            <Text style={[styles.toggleMeta, { color: theme.colors.textMuted }]}>
              Ej: viaje, mudanza, colchón.
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
            label="Título"
            value={firstGoalTitle}
            onChangeText={onChangeFirstGoalTitle}
            placeholder="Ej: Vacaciones"
            maxLength={40}
            accessibilityLabel="Título de la meta"
          />

          <View ref={amountCardRef}>
            <AmountCard
              amount={goalAmount}
              isActive={isGoalNumpadActive}
              onPress={onRequestFirstGoalNumpad}
              label="Monto objetivo"
            />
          </View>

          <View>
            <Text style={[styles.eyebrow, { color: theme.colors.textMuted, marginBottom: 6 }]}>
              EN CUÁNTOS MESES
            </Text>
            <View style={styles.monthsRow}>
              <Pressable
                onPress={() => onChangeFirstGoalMonths(Math.max(1, firstGoalMonths - 1))}
                style={[styles.dayButton, { backgroundColor: theme.colors.creamSoft }]}
                accessibilityRole="button"
                accessibilityLabel="Un mes menos"
              >
                <Text style={[styles.dayButtonText, { color: theme.colors.text }]}>−</Text>
              </Pressable>
              <Text style={[styles.monthsValue, { color: theme.colors.text }]}>
                {firstGoalMonths} {firstGoalMonths === 1 ? 'mes' : 'meses'}
              </Text>
              <Pressable
                onPress={() => onChangeFirstGoalMonths(Math.min(120, firstGoalMonths + 1))}
                style={[styles.dayButton, { backgroundColor: theme.colors.creamSoft }]}
                accessibilityRole="button"
                accessibilityLabel="Un mes más"
              >
                <Text style={[styles.dayButtonText, { color: theme.colors.text }]}>+</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
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
    borderRadius: 18,
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
    borderRadius: 999,
    borderWidth: 1,
  },
  percentChipText: { fontSize: 12, fontWeight: '700' },
  percentHint: { fontSize: 12, marginTop: 2 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
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
  monthsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthsValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  dayButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayButtonText: { fontSize: 18, fontWeight: '800' },
})
