import { useCallback, useMemo, useRef } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  Onb5dCicloGrid,
  type Onb5dCicloTipo,
} from '@/components/redesign/onboarding/onb-5d-parts/onb-5d-secciones'
import {
  OnbSheetDayPicker,
  OnbSheetLabel,
  OnbSheetNotice,
  OnbSheetStepper,
  OnbSheetWeekdayPicker,
  useOnbMode,
  type OnbSheetCaptionSegment,
} from '@/components/settings/sheets/onb-sheet-parts'
import { triggerHaptic } from '@/lib/haptics'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { formatLocalDateKey, parseLocalDateKey } from '@/utils/pay-cycle'

type CycleType = FinanceCycleConfig['cycle_type']

/**
 * Configuración del ciclo con la MISMA superficie, el mismo orden y la
 * misma aritmética que la sección de ciclo del paso 5d del onboarding
 * (`onb-5d-ingresos`): grilla 2×2 de tipo → stepper "cada N días" (solo
 * custom) → calendario de 31 celdas (o fila de 7 días para semanal) con
 * su caption. La grilla y los selectores son los componentes del flujo,
 * importados; lo único propio de editar es el aviso de transición.
 *
 * El modelo persistido (`FinanceCycleConfig`) ancla los ciclos rolling
 * en una FECHA, mientras que el flujo pide un día del mes / de la
 * semana. La conversión es la misma que hace el onboarding al guardar:
 * la ocurrencia del día en el MES ACTUAL para quincenal/custom y la
 * próxima ocurrencia del día de semana para semanal.
 */

const TIPO_BY_TYPE: Record<CycleType, Onb5dCicloTipo> = {
  monthly: 'mensual',
  biweekly: 'quincenal',
  weekly: 'semanal',
  custom: 'custom',
}

const TYPE_BY_TIPO: Record<Onb5dCicloTipo, CycleType> = {
  mensual: 'monthly',
  quincenal: 'biweekly',
  semanal: 'weekly',
  custom: 'custom',
}

/** Rango del ciclo custom — el mismo que topea el flujo (1–90 días). */
export const CYCLE_CUSTOM_MIN_DAYS = 1
export const CYCLE_CUSTOM_MAX_DAYS = 90
/** Duración con la que arranca un ciclo custom nuevo (default del 5d). */
const CYCLE_CUSTOM_DEFAULT_DAYS = 10

const DAY_MS = 24 * 60 * 60 * 1000

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * Ocurrencia del día `day` en el MES ACTUAL (clampeada al último día del
 * mes) → clave ISO local. Mediodía local: el paso de días sobrevive los
 * cambios de horario de verano.
 */
export function cycleAnchorForMonthDay(day: number, today: Date = new Date()): string {
  const safeDay = Math.min(Math.max(1, Math.round(day)), 31)
  const year = today.getFullYear()
  const month = today.getMonth()
  return formatLocalDateKey(new Date(year, month, Math.min(safeDay, daysInMonth(year, month)), 12))
}

/** Próxima ocurrencia (hoy inclusive) del día de semana 0=L…6=D. */
export function cycleAnchorForWeekday(weekday: number, today: Date = new Date()): string {
  const jsTarget = (Math.min(Math.max(0, Math.round(weekday)), 6) + 1) % 7
  const delta = (jsTarget - today.getDay() + 7) % 7
  return formatLocalDateKey(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta, 12),
  )
}

/** Día del mes (1–31) que representa un anchor persistido. */
export function monthDayFromAnchor(iso: string): number | null {
  const day = parseInt(iso.slice(8, 10), 10)
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null
}

/** Día de la semana (0=L…6=D) que representa un anchor persistido. */
export function weekdayFromAnchor(iso: string): number | null {
  const date = parseLocalDateKey(iso)
  const time = date.getTime()
  return Number.isFinite(time) ? (date.getDay() + 6) % 7 : null
}

/** Igualdad estructural del config (el orden de claves no cuenta). */
export function isSameCycleConfig(a: FinanceCycleConfig, b: FinanceCycleConfig): boolean {
  if (a.cycle_type !== b.cycle_type) return false
  if (a.cycle_type === 'monthly' || b.cycle_type === 'monthly') {
    return (
      a.cycle_type === 'monthly' &&
      b.cycle_type === 'monthly' &&
      a.salary_payment_day === b.salary_payment_day
    )
  }
  return (
    a.cycle_anchor_date === b.cycle_anchor_date && a.cycle_length_days === b.cycle_length_days
  )
}

/**
 * Fin del período que contiene HOY — el próximo corte que verá el
 * usuario. Réplica exacta del modelo rolling de `computeRollingN`
 * (period = floor((hoy − anchor) / cadaN); fin = anchor + (period+1)·cadaN),
 * que es lo que anuncia la caption del paso 5d.
 */
function nextCycleDate(anchorIso: string, everyN: number, today: Date = new Date()): Date {
  const step = Number.isFinite(everyN) ? Math.max(1, Math.round(everyN)) : 1
  const anchor = parseLocalDateKey(anchorIso)
  const anchorNoon = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 12)
  const todayNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
  const periodIndex = Math.floor((todayNoon.getTime() - anchorNoon.getTime()) / DAY_MS / step)
  const end = new Date(anchorNoon)
  end.setDate(end.getDate() + (periodIndex + 1) * step)
  return end
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
  /**
   * 'salary' (default): copy de cobro ("día en que cobras") — sueldo
   * fijo. 'cycle': copy neutral de CICLO ("día en que empieza tu
   * ciclo") — modo INGRESO DINÁMICO, donde no existe el cobro. Es la
   * misma bifurcación que el 5d hace entre sueldo fijo y variable.
   */
  copyVariant?: 'salary' | 'cycle'
  /** Día con el que arranca "Mensual" si no hay ninguno que arrastrar. */
  monthlyDefaultDay?: number
}

export function CycleConfigSection({
  value,
  onChange,
  currentConfig,
  copyVariant = 'salary',
  monthlyDefaultDay = 15,
}: CycleConfigSectionProps) {
  const { t } = useTranslation()
  const mode = useOnbMode()
  const isCycleCopy = copyVariant === 'cycle'

  // El día elegido sobrevive al cambio de tipo, como en el flujo: el 5d
  // guarda `diaCobro` / `diaSemana` / `cicloN` en su estado y sólo cambia
  // el ciclo. Acá el union no tiene dónde guardarlos, así que se leen del
  // config vigente y la duración custom se recuerda al salir de custom.
  const lastCustomLength = useRef(
    value.cycle_type === 'custom' ? value.cycle_length_days : CYCLE_CUSTOM_DEFAULT_DAYS,
  )

  const monthDay =
    value.cycle_type === 'monthly'
      ? value.salary_payment_day
      : (monthDayFromAnchor(value.cycle_anchor_date) ?? monthlyDefaultDay)

  const weekday = value.cycle_type === 'monthly' ? null : weekdayFromAnchor(value.cycle_anchor_date)

  const handleTypeChange = useCallback(
    (tipo: Onb5dCicloTipo) => {
      const next = TYPE_BY_TIPO[tipo]
      if (next === value.cycle_type) return
      void triggerHaptic('selection')
      if (value.cycle_type === 'custom') {
        lastCustomLength.current = value.cycle_length_days
      }
      if (next === 'monthly') {
        onChange({ cycle_type: 'monthly', salary_payment_day: monthDay })
        return
      }
      if (next === 'weekly') {
        onChange({
          cycle_type: 'weekly',
          cycle_anchor_date: cycleAnchorForWeekday(weekday ?? (new Date().getDay() + 6) % 7),
          cycle_length_days: 7,
        })
        return
      }
      const anchor = cycleAnchorForMonthDay(monthDay)
      if (next === 'biweekly') {
        onChange({ cycle_type: 'biweekly', cycle_anchor_date: anchor, cycle_length_days: 14 })
        return
      }
      onChange({
        cycle_type: 'custom',
        cycle_anchor_date: anchor,
        cycle_length_days: lastCustomLength.current,
      })
    },
    [monthDay, onChange, value, weekday],
  )

  const handleMonthDayChange = useCallback(
    (day: number) => {
      void triggerHaptic('selection')
      if (value.cycle_type === 'monthly') {
        onChange({ cycle_type: 'monthly', salary_payment_day: day })
        return
      }
      onChange({ ...value, cycle_anchor_date: cycleAnchorForMonthDay(day) })
    },
    [onChange, value],
  )

  const handleWeekdayChange = useCallback(
    (nextWeekday: number) => {
      if (value.cycle_type !== 'weekly') return
      void triggerHaptic('selection')
      onChange({ ...value, cycle_anchor_date: cycleAnchorForWeekday(nextWeekday) })
    },
    [onChange, value],
  )

  const handleCustomLength = useCallback(
    (next: number) => {
      if (value.cycle_type !== 'custom') return
      if (next === value.cycle_length_days) return
      void triggerHaptic('selection')
      lastCustomLength.current = next
      onChange({ ...value, cycle_length_days: next })
    },
    [onChange, value],
  )

  // Caption bajo el selector: mismos segmentos y mismas claves que el 5d.
  const caption = useMemo<OnbSheetCaptionSegment[]>(() => {
    if (value.cycle_type === 'weekly') {
      return [
        { text: t('onboarding:redesign.ingresos.capSemanaPrefix') },
        { text: t(`onboarding:redesign.ingresos.weekday.${weekday ?? 0}`), accent: true },
        { text: t('onboarding:redesign.ingresos.capSemanaSuffix') },
      ]
    }
    if (value.cycle_type === 'monthly') {
      if (isCycleCopy) {
        return [
          { text: t('onboarding:redesign.ingresos.capVarPrefix') },
          { text: String(monthDay), accent: true },
          { text: t('onboarding:redesign.ingresos.capVarSuffix') },
        ]
      }
      return [
        { text: t('onboarding:redesign.ingresos.capMensualPrefix') },
        { text: t('onboarding:redesign.ingresos.capMensualAccent', { dia: monthDay }), accent: true },
        { text: t('onboarding:redesign.ingresos.capMensualSuffix', { dia: monthDay }) },
      ]
    }
    const everyN = value.cycle_length_days
    const next = nextCycleDate(value.cycle_anchor_date, everyN)
    return [
      { text: t('onboarding:redesign.ingresos.capCadaPrefix') },
      { text: t('onboarding:redesign.ingresos.capCadaAccent', { cadaN: everyN }), accent: true },
      {
        text: t('onboarding:redesign.ingresos.capCadaSuffix', {
          dia: monthDay,
          proximo: `${next.getDate()} ${t(`onboarding:redesign.ingresos.month.${next.getMonth()}`)}`,
        }),
      },
    ]
  }, [isCycleCopy, monthDay, t, value, weekday])

  const dayLabel = isCycleCopy && value.cycle_type === 'monthly'
    ? t('settings:cycleConfig.cycleCopy.monthDayLabel')
    : t(`settings:cycleConfig.dayLabel.${value.cycle_type}`)

  const transitionNotice =
    currentConfig && currentConfig.cycle_type !== value.cycle_type
      ? t(
          isCycleCopy
            ? 'settings:cycleConfig.cycleCopy.transitionNotice'
            : 'settings:cycleConfig.transitionNotice',
          {
            from: t(`onboarding:redesign.ingresos.ciclo.${TIPO_BY_TYPE[currentConfig.cycle_type]}.title`),
            to: t(`onboarding:redesign.ingresos.ciclo.${TIPO_BY_TYPE[value.cycle_type]}.title`),
          },
        )
      : null

  return (
    <View>
      <Onb5dCicloGrid
        mode={mode}
        onSelect={handleTypeChange}
        selected={TIPO_BY_TYPE[value.cycle_type]}
      />

      {value.cycle_type === 'custom' ? (
        <>
          <OnbSheetLabel>
            {t(
              isCycleCopy
                ? 'settings:cycleConfig.cycleCopy.everyNDaysLabel'
                : 'onboarding:redesign.ingresos.stepperLabel',
            )}
          </OnbSheetLabel>
          <OnbSheetStepper
            helper={t('onboarding:redesign.ingresos.stepperHelper')}
            max={CYCLE_CUSTOM_MAX_DAYS}
            min={CYCLE_CUSTOM_MIN_DAYS}
            minusLabel={t('settings:cycleConfig.minusDay')}
            onChange={handleCustomLength}
            plusLabel={t('settings:cycleConfig.plusDay')}
            unit={t('onboarding:redesign.ingresos.stepperUnit')}
            value={value.cycle_length_days}
          />
        </>
      ) : null}

      <OnbSheetLabel>{dayLabel}</OnbSheetLabel>
      {value.cycle_type === 'weekly' ? (
        <OnbSheetWeekdayPicker caption={caption} onSelect={handleWeekdayChange} selected={weekday} />
      ) : (
        <OnbSheetDayPicker caption={caption} onSelect={handleMonthDayChange} selected={monthDay} />
      )}

      {transitionNotice ? <OnbSheetNotice>{transitionNotice}</OnbSheetNotice> : null}
    </View>
  )
}
