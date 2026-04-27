import { useMemo, useState } from 'react'
import { Alert, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { NumpadField } from '@/components/ui/numpad-field'
import { formatPriceInputValue } from '@/utils/money'
import { triggerHaptic } from '@/lib/haptics'
import { validateSavingsGoalInput, type SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import { useUpsertSavingsGoal } from '@/features/savings-goals/use-upsert-savings-goal'
import { useAppTheme } from '@/theme/theme-provider'

interface SavingsGoalFormProps {
  familyId: string
  existing: SavingsGoal | null
  onSaved: () => void
}

export function SavingsGoalForm({ familyId, existing, onSaved }: SavingsGoalFormProps) {
  const { theme } = useAppTheme()
  const upsert = useUpsertSavingsGoal(familyId)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🎯')
  const [goalAmount, setGoalAmount] = useState(String(existing?.goalAmount ?? ''))
  const [currentAmount, setCurrentAmount] = useState(String(existing?.currentAmount ?? '0'))
  const [targetMonths, setTargetMonths] = useState(existing?.targetMonths != null ? String(existing.targetMonths) : '')
  const [isActive, setIsActive] = useState(existing?.isActive ?? true)

  const canSubmit = useMemo(() => title.trim().length > 0 && Number(goalAmount) > 0, [title, goalAmount])

  const handleSubmit = async () => {
    try {
      const payload = validateSavingsGoalInput({
        title,
        emoji,
        goalAmount: Number(goalAmount),
        currentAmount: Number(currentAmount),
        targetMonths: targetMonths.trim() === '' ? null : Number(targetMonths),
        isActive,
      })
      await upsert.mutateAsync({ input: payload, existingId: existing?.id ?? null })
      void triggerHaptic('success')
      onSaved()
    } catch (err) {
      void triggerHaptic('error')
      Alert.alert('No pudimos guardar', err instanceof Error ? err.message : 'Intentá de nuevo.')
    }
  }

  return (
    <View style={styles.container}>
      <Field label="Título" value={title} onChange={setTitle} maxLength={40} theme={theme} />
      <Field label="Emoji" value={emoji} onChange={setEmoji} maxLength={2} theme={theme} />
      <NumpadField
        label="Objetivo ($)"
        value={goalAmount}
        onChangeRawValue={setGoalAmount}
        formatDisplay={(raw) => formatPriceInputValue(raw, false)}
        placeholder="$ 0"
      />
      <NumpadField
        label="Actual ($)"
        value={currentAmount}
        onChangeRawValue={setCurrentAmount}
        formatDisplay={(raw) => formatPriceInputValue(raw, false)}
        placeholder="$ 0"
      />
      <NumpadField
        label="Meses objetivo (opcional)"
        value={targetMonths}
        onChangeRawValue={setTargetMonths}
        placeholder="12"
        maxIntegerDigits={3}
        maxDecimalDigits={0}
      />
      <View style={styles.row}>
        <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>Meta activa</Text>
        <Switch value={isActive} onValueChange={setIsActive} />
      </View>
      <AppButton
        label={existing ? 'Guardar cambios' : 'Crear meta'}
        onPress={() => { void handleSubmit() }}
        disabled={!canSubmit || upsert.isPending}
        loading={upsert.isPending}
      />
    </View>
  )
}

function Field({ label, value, onChange, keyboardType = 'default', maxLength, theme }: {
  label: string
  value: string
  onChange: (v: string) => void
  keyboardType?: 'default' | 'numeric'
  maxLength?: number
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        maxLength={maxLength}
        style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
})
