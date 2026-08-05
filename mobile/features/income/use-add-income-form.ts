/**
 * Modelo del wizard "Agregar ingreso" (2 pasos: datos → impacto/confirmar).
 *
 * El NÚCLEO es puro: `missingIncomeFields`, `flaggedFieldsForStep`,
 * `nextStep`/`previousStep` y `resolveEventDate` no tocan React ni RN, así que
 * corren tal cual en el env 'node' de vitest. `useAddIncomeForm` es sólo el
 * envoltorio con `useState` que las compone — toda la regla vive afuera y se
 * testea sin renderer.
 *
 * Dos decisiones que vienen de errores concretos del flujo anterior:
 *
 * 1. Los campos faltantes se identifican por ENUM (`IncomeFormField`), NUNCA
 *    por el string traducido. La pantalla anterior (`add-income-screen.tsx`,
 *    reemplazada por el wizard y ya eliminada) decidía el
 *    highlight con `missingFields.includes(t('gastos:import.field.amount'))`:
 *    la lista se construía con copy localizado y el pintado dependía de que
 *    dos llamadas a `t()` devolvieran exactamente el mismo string. Cambiar una
 *    traducción, o que el usuario esté en inglés con un fallback distinto,
 *    apagaba el warning en silencio (gate bloqueado, cero campos pintados).
 * 2. El aviso es POR PASO y ACUMULATIVO. `use-add-fijo-form` guarda un único
 *    `flaggedStep`, así que marcar el paso 2 pisaba la marca del paso 1: al
 *    volver atrás el usuario perdía el cue de lo que le faltaba. Acá se guarda
 *    el CONJUNTO de pasos marcados y nunca se limpia al navegar; lo que apaga
 *    el highlight es completar el campo, no cambiar de paso.
 */
import { useCallback, useMemo, useState } from 'react'
import { parsePrice, serializePrice } from '@/utils/money'
import type { IncomeEventKind } from './use-income-events'

export type AddIncomeStep = 1 | 2
/** Total de pasos — lo consume el indicador de puntitos del wizard. */
export const ADD_INCOME_TOTAL_STEPS = 2

/** Campos requeridos del alta. Enum, no copy: ver punto 1 del docblock. */
export type IncomeFormField = 'amount' | 'kind' | 'description'

/** 0 = hoy, 1 = ayer, 2 = anteayer. El alta no back-datea más lejos. */
export type IncomeDayOffset = 0 | 1 | 2

/**
 * Tope de la descripción, el MISMO que el alta de gasto
 * (`EXPENSE_DESCRIPTION_MAX_LENGTH`). No se importa de allá porque no es la
 * misma restricción: `expenses.description` tiene tope de servidor y
 * `income_events.description` es `text` sin CHECK, así que acá el número es una
 * decisión de producto y no un espejo del esquema.
 *
 * Venía en 60 y era el defecto que el alta de gasto ya corrigió: el input
 * dejaba de aceptar teclas a mitad de palabra, sin aviso, en el campo REQUERIDO
 * del paso. Con 200 entra una descripción con detalle y los dos wizards cortan
 * en el mismo lugar.
 */
export const INCOME_DESCRIPTION_MAX_LENGTH = 200

export interface AddIncomeDraft {
  /** Monto ya parseado. `NaN`/0/negativo cuentan como faltante. */
  amount: number
  kind: IncomeEventKind | null
  description: string
  dayOffset: IncomeDayOffset
}

/**
 * Orden de aparición en el aviso ("te falta …"). Es también el orden en que
 * los campos están en pantalla: el usuario lee la lista de arriba hacia abajo.
 */
export const INCOME_FORM_FIELDS: readonly IncomeFormField[] = [
  'amount',
  'kind',
  'description',
]

/**
 * En qué paso se COMPLETA cada campo. Los tres son del paso 1; el paso 2 sólo
 * muestra el impacto y confirma, por eso nunca aporta faltantes. El mapa existe
 * igual para que `flaggedFieldsForStep` no pueda pintar en el paso 2 un campo
 * que se edita en el 1 (el cue dejaría de significar "esto te falta acá").
 */
export const INCOME_FIELD_STEP: Record<IncomeFormField, AddIncomeStep> = {
  amount: 1,
  kind: 1,
  description: 1,
}

/**
 * Predicado por campo. Cada entrada corresponde 1:1 con una de
 * `INCOME_FORM_FIELDS`: `Record` completo ⇒ agregar un campo al union obliga a
 * escribir su regla, no se puede quedar un campo requerido sin gate (que fue
 * exactamente cómo el flujo viejo dejaba pasar descripciones en blanco).
 */
const FIELD_IS_FILLED: Record<IncomeFormField, (draft: AddIncomeDraft) => boolean> = {
  amount: (d) => Number.isFinite(d.amount) && d.amount > 0,
  kind: (d) => d.kind !== null,
  description: (d) => d.description.trim().length > 0,
}

/** Campos que faltan, en el orden de `INCOME_FORM_FIELDS`. */
export function missingIncomeFields(draft: AddIncomeDraft): IncomeFormField[] {
  return INCOME_FORM_FIELDS.filter((field) => !FIELD_IS_FILLED[field](draft))
}

/** Gate del paso 1 → 2: monto > 0, tipo elegido y descripción no vacía. */
export function canContinueWith(draft: AddIncomeDraft): boolean {
  return missingIncomeFields(draft).length === 0
}

/**
 * Campos a pintar en `step`. Devuelve vacío si ese paso todavía no fue marcado
 * (el usuario no tocó el CTA incompleto ahí). Se recalcula contra el draft
 * ACTUAL, no contra una foto del momento de marcar: completar el campo apaga
 * su highlight sin pasos extra.
 */
export function flaggedFieldsForStep(
  draft: AddIncomeDraft,
  step: AddIncomeStep,
  flaggedSteps: readonly AddIncomeStep[],
): IncomeFormField[] {
  if (!flaggedSteps.includes(step)) return []
  return missingIncomeFields(draft).filter((field) => INCOME_FIELD_STEP[field] === step)
}

/** 1 → 2; desde el último paso no hay siguiente (el 2 confirma, no avanza). */
export function nextStep(step: AddIncomeStep): AddIncomeStep | null {
  return step === 1 ? 2 : null
}

/** 2 → 1; desde el 1 no hay anterior — ahí "atrás" es cerrar el alta. */
export function previousStep(step: AddIncomeStep): AddIncomeStep | null {
  return step === 2 ? 1 : null
}

/**
 * Fecha del ingreso según el offset, anclada al MEDIODÍA local.
 *
 * El mediodía no es cosmético: el gotcha de timestamptz del proyecto es que una
 * fecha a medianoche local se corre un día al serializarse a UTC (AR = UTC-3).
 * Quien consuma esto para persistir tiene que pasarlo igual por
 * `formatLocalDateKey`, que lee los getters locales.
 */
export function resolveEventDate(
  dayOffset: IncomeDayOffset,
  now: Date = new Date(),
): Date {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - dayOffset,
    12,
    0,
    0,
    0,
  )
}

export interface AddIncomeFormState {
  step: AddIncomeStep
  /** Texto crudo del numpad. El parseo canónico lo hace `parsePrice`. */
  rawAmount: string
  setRawAmount: (value: string) => void
  amount: number
  kind: IncomeEventKind | null
  setKind: (value: IncomeEventKind | null) => void
  description: string
  setDescription: (value: string) => void
  dayOffset: IncomeDayOffset
  setDayOffset: (value: IncomeDayOffset) => void
  /** Snapshot puro del form — es lo que consumen las funciones de arriba. */
  draft: AddIncomeDraft
  eventDate: Date
  missingFields: IncomeFormField[]
  canContinue: boolean
  /**
   * Gate del CTA de confirmar. Hoy vale lo mismo que `canContinue` —el paso 2
   * sólo muestra el impacto y elige el día, que siempre tiene valor—, pero se
   * expone aparte y derivado de `INCOME_FIELD_STEP` para que agregar mañana un
   * campo obligatorio al paso 2 no requiera acordarse de tocar el CTA. Mismo
   * contrato que `useAddExpenseForm.canSubmit`.
   */
  canSubmit: boolean
  /** Campos a pintar EN EL PASO ACTUAL. */
  flaggedFields: IncomeFormField[]
  isFieldFlagged: (field: IncomeFormField) => boolean
  /** Marca el paso actual (el usuario tocó el CTA con datos faltantes). */
  flagMissing: () => void
  /** `true` si avanzó; `false` si faltaban datos (y marcó el paso). */
  goNext: () => boolean
  /** `true` si retrocedió; `false` si ya estaba en el paso 1 (⇒ cerrar). */
  goBack: () => boolean
  addQuickAmount: (delta: number) => void
  clearAmount: () => void
}

/**
 * Envoltorio con estado. No dispara hápticos ni toca el teclado: eso es
 * decisión de presentación y lo hace la screen, para que el modelo siga
 * corriendo en un test de node sin stubs.
 */
export function useAddIncomeForm(): AddIncomeFormState {
  const [step, setStep] = useState<AddIncomeStep>(1)
  const [rawAmount, setRawAmount] = useState('')
  // Sin tipo preseleccionado: elegirlo es explícito, misma postura de
  // integridad de datos que add-gasto con la categoría.
  const [kind, setKind] = useState<IncomeEventKind | null>(null)
  const [description, setDescription] = useState('')
  const [dayOffset, setDayOffset] = useState<IncomeDayOffset>(0)
  const [flaggedSteps, setFlaggedSteps] = useState<AddIncomeStep[]>([])

  const parsed = parsePrice(rawAmount)
  const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0

  const draft = useMemo<AddIncomeDraft>(
    () => ({ amount, kind, description, dayOffset }),
    [amount, kind, description, dayOffset],
  )
  const missingFields = useMemo(() => missingIncomeFields(draft), [draft])
  const canContinue = missingFields.length === 0
  const canSubmit =
    canContinue && missingFields.every((f) => INCOME_FIELD_STEP[f] !== 2)
  const flaggedFields = useMemo(
    () => flaggedFieldsForStep(draft, step, flaggedSteps),
    [draft, step, flaggedSteps],
  )

  const isFieldFlagged = useCallback(
    (field: IncomeFormField) => flaggedFields.includes(field),
    [flaggedFields],
  )

  // Acumulativo y sin limpieza al navegar — ver punto 2 del docblock.
  const flagMissing = useCallback(() => {
    setFlaggedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]))
  }, [step])

  const goNext = useCallback(() => {
    if (!canContinue) {
      flagMissing()
      return false
    }
    const target = nextStep(step)
    if (target === null) return false
    setStep(target)
    return true
  }, [canContinue, flagMissing, step])

  const goBack = useCallback(() => {
    const target = previousStep(step)
    if (target === null) return false
    setStep(target)
    return true
  }, [step])

  const addQuickAmount = useCallback(
    (delta: number) => {
      setRawAmount(serializePrice(amount + delta))
    },
    [amount],
  )
  const clearAmount = useCallback(() => setRawAmount(''), [])

  const eventDate = useMemo(() => resolveEventDate(dayOffset), [dayOffset])

  // El objeto se MEMOIZA: la pantalla cuelga nueve `useCallback` de `[form]` y
  // un literal nuevo por render los recreaba todos en cada tecla de la
  // descripción, lo que a su vez derrotaba cualquier memo aguas abajo (los 9
  // tiles animados del rail se re-renderizaban por caracter tipeado).
  return useMemo(
    () => ({
      step,
      rawAmount,
      setRawAmount,
      amount,
      kind,
      setKind,
      description,
      setDescription,
      dayOffset,
      setDayOffset,
      draft,
      eventDate,
      missingFields,
      canContinue,
      canSubmit,
      flaggedFields,
      isFieldFlagged,
      flagMissing,
      goNext,
      goBack,
      addQuickAmount,
      clearAmount,
    }),
    [
      step,
      rawAmount,
      amount,
      kind,
      description,
      dayOffset,
      draft,
      eventDate,
      missingFields,
      canContinue,
      canSubmit,
      flaggedFields,
      isFieldFlagged,
      flagMissing,
      goNext,
      goBack,
      addQuickAmount,
      clearAmount,
    ],
  )
}
