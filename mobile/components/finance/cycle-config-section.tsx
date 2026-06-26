import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { MonthDayPicker } from '@/components/ui/month-day-picker'
import { BaseMonthCalendar } from '@/components/ui/base-month-calendar'
import { useAppTheme } from '@/theme/theme-provider'
import { triggerHaptic } from '@/lib/haptics'
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
  custom:   'Indica la fecha del próximo cobro y cuántos días dura el ciclo.',
}

const CUSTOM_LENGTH_MIN = 1
const CUSTOM_LENGTH_MAX = 365

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
  const todayIso = useMemo(() => formatLocalDateKey(today), [today])

  const handleTypeChange = (next: FinanceCycleConfig['cycle_type']) => {
    if (next === value.cycle_type) return
    void triggerHaptic('selection')
    if (next === 'monthly') {
      onChange({ cycle_type: 'monthly', salary_payment_day: 15 })
      return
    }
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
      cycle_length_days: 10,
    })
  }

  const handleAnchorChange = (iso: string) => {
    if (value.cycle_type === 'monthly') return
    onChange({ ...value, cycle_anchor_date: iso })
  }

  const handleCustomLengthStep = (delta: number) => {
    if (value.cycle_type !== 'custom') return
    const next = clamp(value.cycle_length_days + delta, CUSTOM_LENGTH_MIN, CUSTOM_LENGTH_MAX)
    if (next === value.cycle_length_days) return
    void triggerHaptic('selection')
    onChange({ ...value, cycle_length_days: next })
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
                  borderColor: selected ? theme.colors.primary : theme.colors.line,
                  backgroundColor: selected
                    ? `${theme.colors.primary}1A`
                    : theme.colors.creamSoft,
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
        <View style={styles.rollingStack}>
          <View>
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>¿CUÁNDO ES TU PRÓXIMO COBRO?</Text>
            <BaseMonthCalendar
              initialYear={anchorYear(value.cycle_anchor_date, today)}
              initialMonth={anchorMonth(value.cycle_anchor_date, today)}
              selectedIsoDate={value.cycle_anchor_date}
              today={today}
              onSelectDay={handleAnchorChange}
            />
          </View>
          {value.cycle_type === 'custom' ? (
            <View>
              <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>CADA CUÁNTOS DÍAS COBRÁS</Text>
              <View
                style={[
                  styles.stepperCard,
                  { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
                ]}
              >
                <Pressable
                  onPress={() => handleCustomLengthStep(-1)}
                  disabled={value.cycle_length_days <= CUSTOM_LENGTH_MIN}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Restar un día"
                  style={({ pressed }) => [
                    styles.stepperBtn,
                    { backgroundColor: theme.colors.creamSoft, borderColor: theme.colors.line },
                    value.cycle_length_days <= CUSTOM_LENGTH_MIN && styles.stepperBtnDisabled,
                    pressed && value.cycle_length_days > CUSTOM_LENGTH_MIN && styles.stepperBtnPressed,
                  ]}
                >
                  <MaterialIcons name="remove" size={18} color={theme.colors.text} />
                </Pressable>
                <View style={styles.stepperValue}>
                  <Text style={[styles.stepperValueNum, { color: theme.colors.text }]}>
                    {value.cycle_length_days}
                  </Text>
                  <Text style={[styles.stepperValueUnit, { color: theme.colors.textMuted }]}>
                    {value.cycle_length_days === 1 ? 'día' : 'días'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleCustomLengthStep(+1)}
                  disabled={value.cycle_length_days >= CUSTOM_LENGTH_MAX}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Sumar un día"
                  style={({ pressed }) => [
                    styles.stepperBtn,
                    { backgroundColor: theme.colors.creamSoft, borderColor: theme.colors.line },
                    value.cycle_length_days >= CUSTOM_LENGTH_MAX && styles.stepperBtnDisabled,
                    pressed && value.cycle_length_days < CUSTOM_LENGTH_MAX && styles.stepperBtnPressed,
                  ]}
                >
                  <MaterialIcons name="add" size={18} color={theme.colors.text} />
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      )}

      <Text style={[styles.helper, { color: theme.colors.textMuted }]}>{HELPER[value.cycle_type]}</Text>

      {transitionNotice ? (
        <View
          style={[
            styles.notice,
            { borderColor: theme.colors.line, backgroundColor: theme.colors.creamSoft },
          ]}
        >
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
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
  rollingStack: { gap: 16 },
  stepperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnPressed: { opacity: 0.6 },
  stepperBtnDisabled: { opacity: 0.35 },
  stepperValue: {
    flex: 1,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  stepperValueNum: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  stepperValueUnit: { fontSize: 13, fontWeight: '600' },
  helper: { fontSize: 12, marginTop: 4 },
  notice: {
    marginTop: 4,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  noticeText: { fontSize: 12, lineHeight: 18 },
})
