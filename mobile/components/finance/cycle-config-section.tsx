import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { MonthDayPicker } from '@/components/ui/month-day-picker'
import { BaseMonthCalendar } from '@/components/ui/base-month-calendar'
import { useAppTheme } from '@/theme/theme-provider'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { formatLocalDateKey, normalizeToStartOfDay } from '@/utils/pay-cycle'

interface CycleTypeChipDef {
  type: FinanceCycleConfig['cycle_type']
  title: string
  subtitle: string
}

const CYCLE_TYPES: CycleTypeChipDef[] = [
  { type: 'monthly',  title: 'Mensual',   subtitle: 'Una vez al mes' },
  { type: 'biweekly', title: 'Quincenal', subtitle: 'Cada 14 días' },
  { type: 'weekly',   title: 'Semanal',   subtitle: 'Cada 7 días' },
  { type: 'custom',   title: 'Custom',    subtitle: 'Cada N días' },
]

const HELPER: Record<FinanceCycleConfig['cycle_type'], string> = {
  monthly:  'El ciclo dura 28-31 días según el mes.',
  biweekly: 'A partir de esta fecha, cada 14 días.',
  weekly:   'A partir de esta fecha, cada 7 días.',
  custom:   'Indicá la fecha del próximo cobro y cuántos días dura el ciclo.',
}

interface CycleConfigSectionProps {
  value: FinanceCycleConfig
  onChange: (next: FinanceCycleConfig) => void
  /**
   * El config ACTUALMENTE persistido (snapshot pre-edit). Cuando se
   * pasa Y `value.cycle_type` difiere, se muestra un aviso de
   * "el cambio aplicará al próximo cobro". Onboarding NO pasa este
   * prop — no hay config previo. Settings sí lo pasa.
   */
  currentConfig?: FinanceCycleConfig
}

export function CycleConfigSection({ value, onChange, currentConfig }: CycleConfigSectionProps) {
  const { theme } = useAppTheme()
  const today = useMemo(() => normalizeToStartOfDay(new Date()), [])

  // Texto del input numérico para Custom — separamos del config para
  // que el user pueda tipear "" o "1" sin que onChange dispare un
  // estado inválido en cada keystroke.
  const [customLengthText, setCustomLengthText] = useState(
    value.cycle_type === 'custom' ? String(value.cycle_length_days) : '10',
  )

  const handleTypeChange = (next: FinanceCycleConfig['cycle_type']) => {
    if (next === value.cycle_type) return
    if (next === 'monthly') {
      onChange({ cycle_type: 'monthly', salary_payment_day: 15 })
      return
    }
    const todayIso = formatLocalDateKey(today)
    if (next === 'biweekly') {
      onChange({ cycle_type: 'biweekly', cycle_anchor_date: todayIso, cycle_length_days: 14 })
      return
    }
    if (next === 'weekly') {
      onChange({ cycle_type: 'weekly', cycle_anchor_date: todayIso, cycle_length_days: 7 })
      return
    }
    onChange({
      cycle_type: 'custom',
      cycle_anchor_date: todayIso,
      cycle_length_days: parseLengthOr(customLengthText, 10),
    })
  }

  const handleAnchorChange = (iso: string) => {
    if (value.cycle_type === 'monthly') return
    onChange({ ...value, cycle_anchor_date: iso })
  }

  const handleCustomLengthChange = (text: string) => {
    setCustomLengthText(text)
    if (value.cycle_type !== 'custom') return
    const n = parseLengthOr(text, value.cycle_length_days)
    onChange({ ...value, cycle_length_days: n })
  }

  const transitionNotice =
    currentConfig && currentConfig.cycle_type !== value.cycle_type
      ? `Estás cambiando tu ciclo de ${typeLabel(currentConfig.cycle_type)} a ${typeLabel(value.cycle_type)}. El cambio aplica al próximo cobro que indicaste.`
      : null

  return (
    <View style={styles.container}>
      <View style={styles.chipsRow}>
        {CYCLE_TYPES.map((def) => {
          const selected = def.type === value.cycle_type
          return (
            <Pressable
              key={def.type}
              onPress={() => handleTypeChange(def.type)}
              style={[
                styles.chip,
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? `${theme.colors.primary}1A` : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipTitle, { color: theme.colors.text }]}>{def.title}</Text>
              <Text style={[styles.chipSubtitle, { color: theme.colors.textMuted }]}>{def.subtitle}</Text>
            </Pressable>
          )
        })}
      </View>

      {value.cycle_type === 'monthly' ? (
        <View>
          <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>DÍA DEL MES EN QUE COBRÁS</Text>
          <MonthDayPicker
            value={value.salary_payment_day}
            onChange={(d) => onChange({ cycle_type: 'monthly', salary_payment_day: d })}
          />
        </View>
      ) : (
        <View>
          <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>¿CUÁNDO ES TU PRÓXIMO COBRO?</Text>
          <BaseMonthCalendar
            year={anchorYear(value.cycle_anchor_date, today)}
            month={anchorMonth(value.cycle_anchor_date, today)}
            selectedIsoDate={value.cycle_anchor_date}
            today={today}
            onSelectDay={handleAnchorChange}
          />
          {value.cycle_type === 'custom' ? (
            <View style={styles.lengthRow}>
              <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>CADA CUÁNTOS DÍAS COBRÁS</Text>
              <TextInput
                value={customLengthText}
                onChangeText={handleCustomLengthChange}
                keyboardType="number-pad"
                maxLength={3}
                style={[styles.lengthInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
              />
            </View>
          ) : null}
        </View>
      )}

      <Text style={[styles.helper, { color: theme.colors.textMuted }]}>{HELPER[value.cycle_type]}</Text>

      {transitionNotice ? (
        <View style={[styles.notice, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted ?? 'transparent' }]}>
          <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>{transitionNotice}</Text>
        </View>
      ) : null}
    </View>
  )
}

function typeLabel(t: FinanceCycleConfig['cycle_type']): string {
  return t === 'monthly' ? 'Mensual'
    : t === 'biweekly' ? 'Quincenal'
    : t === 'weekly' ? 'Semanal'
    : 'Custom'
}

function parseLengthOr(text: string, fallback: number): number {
  const n = parseInt(text, 10)
  if (!Number.isInteger(n) || n < 1 || n > 365) return fallback
  return n
}

function anchorYear(iso: string, today: Date): number {
  const y = parseInt(iso.slice(0, 4), 10)
  return Number.isFinite(y) && y > 1970 ? y : today.getFullYear()
}

function anchorMonth(iso: string, today: Date): number {
  const m = parseInt(iso.slice(5, 7), 10)
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : today.getMonth()
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: '47%',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  chipTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  chipSubtitle: { fontSize: 11 },
  fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginBottom: 8 },
  lengthRow: { marginTop: 14, gap: 6 },
  lengthInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
    width: 110,
  },
  helper: { fontSize: 12, marginTop: 4 },
  notice: {
    marginTop: 4,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  noticeText: { fontSize: 12, lineHeight: 18 },
})
