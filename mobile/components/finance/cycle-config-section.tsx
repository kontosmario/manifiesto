import { useMemo } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import i18n from '@/lib/i18n'
import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'
import { MonthDayPicker } from '@/components/ui/month-day-picker'
import { BaseMonthCalendar } from '@/components/ui/base-month-calendar'
import { useAppTheme } from '@/theme/theme-provider'
import { triggerHaptic } from '@/lib/haptics'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { formatLocalDateKey, normalizeToStartOfDay } from '@/utils/pay-cycle'

const CYCLE_TYPE_ORDER: FinanceCycleConfig['cycle_type'][] = [
  'monthly',
  'biweekly',
  'weekly',
  'custom',
]

// Sticker PNG (from the category icon registry) shown beside each
// cycle-type chip title — maps each cadence to its "frecuencias" sticker.
const CYCLE_TYPE_ICON: Record<FinanceCycleConfig['cycle_type'], string> = {
  monthly: 'frecuencias/mensual',
  biweekly: 'frecuencias/quincenal',
  weekly: 'frecuencias/semanal',
  custom: 'frecuencias/cuotas',
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
  const { t } = useTranslation()
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
      ? t('settings:cycleConfig.transitionNotice', {
          from: typeLabel(currentConfig.cycle_type),
          to: typeLabel(value.cycle_type),
        })
      : null

  return (
    <View style={styles.container}>
      <View style={styles.chipsRow}>
        {CYCLE_TYPE_ORDER.map((type) => {
          const selected = type === value.cycle_type
          return (
            <Pressable
              key={type}
              onPress={() => handleTypeChange(type)}
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
              <View style={styles.chipTitleRow}>
                {CATEGORY_ICONS[CYCLE_TYPE_ICON[type]] ? (
                  <Image
                    source={CATEGORY_ICONS[CYCLE_TYPE_ICON[type]]}
                    style={styles.chipIcon}
                    resizeMode="contain"
                  />
                ) : null}
                <Text style={[styles.chipTitle, { color: theme.colors.text }]}>{t(`settings:cycleConfig.type.${type}.title`)}</Text>
              </View>
              <Text style={[styles.chipSubtitle, { color: theme.colors.textMuted }]}>{t(`settings:cycleConfig.type.${type}.subtitle`)}</Text>
            </Pressable>
          )
        })}
      </View>

      {value.cycle_type === 'monthly' ? (
        <View>
          <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>{t('settings:cycleConfig.monthDayLabel')}</Text>
          <MonthDayPicker
            value={value.salary_payment_day}
            onChange={(d) => onChange({ cycle_type: 'monthly', salary_payment_day: d })}
          />
        </View>
      ) : (
        <View style={styles.rollingStack}>
          <View>
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>{t('settings:cycleConfig.nextPaydayLabel')}</Text>
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
              <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>{t('settings:cycleConfig.everyNDaysLabel')}</Text>
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
                  accessibilityLabel={t('settings:cycleConfig.minusDay')}
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
                    {t('settings:cycleConfig.days', { count: value.cycle_length_days })}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleCustomLengthStep(+1)}
                  disabled={value.cycle_length_days >= CUSTOM_LENGTH_MAX}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('settings:cycleConfig.plusDay')}
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

      <Text style={[styles.helper, { color: theme.colors.textMuted }]}>{t(`settings:cycleConfig.helper.${value.cycle_type}`)}</Text>

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

function typeLabel(type: FinanceCycleConfig['cycle_type']): string {
  return i18n.t(`settings:cycleConfig.type.${type}.title`)
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
  chipTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  chipIcon: { width: 24, height: 24 },
  chipTitle: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
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
