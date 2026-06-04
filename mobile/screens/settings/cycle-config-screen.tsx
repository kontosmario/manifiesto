import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CycleConfigSection } from '@/components/finance/cycle-config-section'
import {
  buildFamilyFinanceInput,
  useFamilyFinance,
  useUpsertFamilyFinance,
} from '@/features/finance/use-family-finance'
import {
  financeToCycleConfig,
  type FinanceCycleConfig,
} from '@/utils/finance-cycle-config'
import { useAppTheme } from '@/theme/theme-provider'
import { toast } from '@/lib/toast-bus'

interface CycleConfigScreenProps {
  familyId: string
}

export function CycleConfigScreen({ familyId }: CycleConfigScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const financeQuery = useFamilyFinance(familyId)
  const upsert = useUpsertFamilyFinance(familyId)

  const initial = useMemo<FinanceCycleConfig>(
    () => financeToCycleConfig(financeQuery.data),
    [financeQuery.data],
  )
  const [config, setConfig] = useState<FinanceCycleConfig>(initial)

  // Si la query resuelve TARDE (initial era el default), re-seedeamos
  // una vez, manteniendo edits posteriores intactos.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (!hydrated && financeQuery.data) {
      setConfig(initial)
      setHydrated(true)
    }
  }, [hydrated, financeQuery.data, initial])

  const dirty = JSON.stringify(config) !== JSON.stringify(initial)

  const handleSave = async () => {
    if (!financeQuery.data) return
    const input = buildFamilyFinanceInput({
      dailyBudgetBufferMode: financeQuery.data.daily_budget_buffer_mode,
      dailyBudgetBufferValue: financeQuery.data.daily_budget_buffer_value,
      dailyBudgetCheckinHour: financeQuery.data.daily_budget_checkin_hour,
      dailyBudgetNudgesEnabled: financeQuery.data.daily_budget_nudges_enabled,
      monthlyIncome: financeQuery.data.monthly_income,
      savingsGoal: financeQuery.data.savings_goal,
      savingsGoalPercent: financeQuery.data.savings_goal_percent,
      usdExchangeRate: financeQuery.data.usd_exchange_rate,
      lastSalaryConfirmedAt: financeQuery.data.last_salary_confirmed_at,
      currentCycleStartingBalance:
        financeQuery.data.current_cycle_starting_balance,
      currentCycleAnchor: financeQuery.data.current_cycle_anchor,
      salaryPaymentDay:
        config.cycle_type === 'monthly' ? config.salary_payment_day : 1,
      cycleType: config.cycle_type,
      cycleAnchorDate:
        config.cycle_type === 'monthly' ? null : config.cycle_anchor_date,
      cycleLengthDays:
        config.cycle_type === 'monthly' ? null : config.cycle_length_days,
    })
    try {
      await upsert.mutateAsync(input)
      toast.success('Ciclo actualizado.')
      router.back()
    } catch {
      toast.error('No se pudo guardar el ciclo.')
    }
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background, paddingTop: insets.top },
      ]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 100 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Ciclo de cobro
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          Cambiar el tipo aplica al próximo cobro. El ciclo actual sigue su
          curso.
        </Text>
        <CycleConfigSection
          value={config}
          onChange={setConfig}
          currentConfig={initial}
        />
      </ScrollView>
      <View
        style={[
          styles.footer,
          {
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.background,
            paddingBottom: 16 + insets.bottom,
          },
        ]}
      >
        <Pressable
          onPress={handleSave}
          disabled={!dirty || upsert.isPending}
          style={[
            styles.saveBtn,
            {
              backgroundColor: dirty
                ? theme.colors.primary
                : theme.colors.border,
              opacity: upsert.isPending ? 0.6 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !dirty || upsert.isPending }}
        >
          <Text
            style={[styles.saveBtnText, { color: theme.colors.background }]}
          >
            {upsert.isPending ? 'Guardando…' : 'Guardar'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { fontSize: 13, marginBottom: 10 },
  footer: { padding: 16, borderTopWidth: 1 },
  saveBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '700' },
})
