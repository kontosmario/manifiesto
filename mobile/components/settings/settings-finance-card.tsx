import { StyleSheet, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { SectionHeader } from '@/components/ui/section-header'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { TextField } from '@/components/ui/text-field'
import { SettingsSwitchRow } from '@/components/settings/settings-primitives'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

interface SettingsFinanceCardProps {
  bufferDraft: string
  bufferModeDraft: 'none' | 'fixed' | 'percent'
  canSaveFinance: boolean
  checkinHourDraft: string
  incomeValue: string
  isSaving: boolean
  nudgesEnabledDraft: boolean
  onBufferBlur: () => void
  onBufferChange: (value: string) => void
  onBufferFocus: () => void
  onBufferModeChange: (value: 'none' | 'fixed' | 'percent') => void
  onCheckinHourChange: (value: string) => void
  onIncomeBlur: () => void
  onIncomeChange: (value: string) => void
  onIncomeFocus: () => void
  onNudgesToggle: (value: boolean) => void
  onSalaryDayChange: (value: string) => void
  onSave: () => void
  onSavingsBlur: () => void
  onSavingsChange: (value: string) => void
  onSavingsFocus: () => void
  onUsdRateBlur: () => void
  onUsdRateChange: (value: string) => void
  onUsdRateFocus: () => void
  salaryDayDraft: string
  savingsHelper: string
  savingsValue: string
  usdRateValue: string
}

export function SettingsFinanceCard({
  bufferDraft,
  bufferModeDraft,
  canSaveFinance,
  checkinHourDraft,
  incomeValue,
  isSaving,
  nudgesEnabledDraft,
  onBufferBlur,
  onBufferChange,
  onBufferFocus,
  onBufferModeChange,
  onCheckinHourChange,
  onIncomeBlur,
  onIncomeChange,
  onIncomeFocus,
  onNudgesToggle,
  onSalaryDayChange,
  onSave,
  onSavingsBlur,
  onSavingsChange,
  onSavingsFocus,
  onUsdRateBlur,
  onUsdRateChange,
  onUsdRateFocus,
  salaryDayDraft,
  savingsHelper,
  savingsValue,
  usdRateValue,
}: SettingsFinanceCardProps) {
  const { theme } = useAppTheme()

  return (
    <BrandedPanel style={styles.card}>
      <SectionHeader subtitle="Base del cálculo mensual del hogar." title="Finanzas" />
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <TextField
          keyboardType="decimal-pad"
          label="Ingreso mensual"
          onBlur={onIncomeBlur}
          onChangeText={onIncomeChange}
          onFocus={onIncomeFocus}
          placeholder="$ 0"
          value={incomeValue}
        />
        <TextField
          helper={savingsHelper}
          keyboardType="number-pad"
          label="Ahorro objetivo (%)"
          onBlur={onSavingsBlur}
          onChangeText={onSavingsChange}
          onFocus={onSavingsFocus}
          placeholder="20"
          value={savingsValue}
        />
        <TextField
          keyboardType="decimal-pad"
          label="Cotización USD"
          onBlur={onUsdRateBlur}
          onChangeText={onUsdRateChange}
          onFocus={onUsdRateFocus}
          placeholder="$ 0"
          value={usdRateValue}
        />
        <TextField
          helper="Día del mes en que entra el ingreso principal."
          keyboardType="number-pad"
          label="Día de cobro"
          onChangeText={onSalaryDayChange}
          placeholder="1"
          value={salaryDayDraft}
        />
      </View>
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <SectionHeader
          subtitle="Define cuánto margen querés reservar antes de repartir el disponible por día."
          title="Presupuesto diario"
        />
        <SegmentedControl
          onChange={onBufferModeChange}
          options={[
            { label: 'Sin colchón', value: 'none' },
            { label: '$ Fijo', value: 'fixed' },
            { label: '%', value: 'percent' },
          ]}
          value={bufferModeDraft}
        />
        <TextField
          helper={
            bufferModeDraft === 'none'
              ? 'Sin colchón extra: todo el disponible se reparte en el ciclo.'
              : bufferModeDraft === 'percent'
                ? 'Porcentaje del presupuesto variable reservado como colchón.'
                : 'Monto reservado por fuera del operativo diario.'
          }
          keyboardType="decimal-pad"
          label={bufferModeDraft === 'percent' ? 'Colchón (%)' : 'Colchón'}
          onBlur={onBufferBlur}
          onChangeText={onBufferChange}
          onFocus={onBufferFocus}
          placeholder={bufferModeDraft === 'percent' ? '0' : '$ 0'}
          value={bufferDraft}
        />
        <SettingsSwitchRow
          description="Activa recordatorios y alertas del presupuesto diario."
          label="Nudges inteligentes"
          onValueChange={onNudgesToggle}
          value={nudgesEnabledDraft}
        />
        <TextField
          helper="Hora de referencia en formato 0 a 23."
          keyboardType="number-pad"
          label="Hora del check-in"
          onChangeText={onCheckinHourChange}
          placeholder="9"
          value={checkinHourDraft}
        />
      </View>
      <AppButton
        disabled={!canSaveFinance}
        label="Guardar métricas"
        loading={isSaving}
        onPress={onSave}
      />
    </BrandedPanel>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 18,
  },
  sectionCard: {
    gap: 16,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
})
