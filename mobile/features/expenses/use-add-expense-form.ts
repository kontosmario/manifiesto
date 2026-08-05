/**
 * Máquina de estados del wizard "agregar gasto" (2 pasos). Es el espejo de
 * `use-add-fijo-form` para el flujo de gastos variables: SOLO state + gates.
 *
 * Qué NO hace (a propósito):
 *  · No trae categorías ni gastos, no muta nada, no toca haptics ni teclado.
 *    Los datos y la mutación siguen viviendo en `use-add-expense-controller`
 *    (categorías rankeadas, sugerencias, `createExpenseMutation`); este hook
 *    es el que decide QUÉ falta y CUÁNDO se puede avanzar. Duplicarle la
 *    query o la mutation sería partir la lógica de negocio en dos.
 *  · No importa nada de `react-native`: la parte derivable (`evaluateAddExpenseGates`,
 *    `missingFieldsForStep`) tiene que poder correr en vitest env node, que no
 *    tiene renderer de React — por eso los gates son funciones puras exportadas
 *    y el hook es una cáscara delgada sobre ellas.
 *
 * Los campos faltantes se identifican por el ENUM `AddExpenseField`, NUNCA por
 * el string localizado. El controller viejo empujaba `i18n.t('gastos:import.field.amount')`
 * a una lista y la screen preguntaba `missingFields.includes(t(...))`: cualquier
 * cambio de copy —o un cambio de idioma entre el render del controller y el de
 * la screen— apagaba el resaltado sin que nada fallara. El copy se resuelve en
 * el borde (UI), a partir del enum.
 */
import { useCallback, useMemo, useState } from 'react'
import { parsePrice, serializePrice } from '@/utils/money'

export type AddExpenseStep = 1 | 2

/** Campos REQUERIDOS del wizard. El orden es el de aparición en el paso 1
 *  (monto → categoría → descripción): la línea "Completá …" lee en el mismo
 *  orden en que el usuario recorre el formulario. */
export type AddExpenseField = 'amount' | 'category' | 'description'

/**
 * A qué paso pertenece cada campo requerido. El paso 2 no tiene ninguno
 * (notas y fecha son opcionales), pero la tabla existe igual: es lo que hace
 * que el resaltado sea POR PASO y no global — sin esto, tocar el CTA
 * bloqueado en el paso 1 dejaba el paso 2 pintado de advertencia antes de que
 * el usuario hiciera nada ahí.
 */
const FIELD_STEP: Record<AddExpenseField, AddExpenseStep> = {
  amount: 1,
  category: 1,
  description: 1,
}

export interface AddExpenseGatesInput {
  rawPrice: string
  /** `''` (o un id que ya no resuelve) == sin categoría elegida. */
  categoryId: string
  description: string
  /**
   * Si el `categoryId` EXISTE entre las categorías cargadas. Lo resuelve el
   * caller, que es el que tiene la query.
   *
   * Igual que en `use-add-fijo-form`: chequear sólo `categoryId !== ''` deja
   * pasar un id que ya no resuelve (categoría borrada por otro miembro, query
   * todavía hidratando, prefill viejo del Asistente). El CTA se veía
   * habilitado y el submit volvía en silencio contra su propio guard.
   */
  isCategoryIdValid: (id: string) => boolean
}

export interface AddExpenseGates {
  /** Monto parseado y saneado: 0 cuando el raw está vacío, es NaN o es ≤ 0. */
  amount: number
  hasValidAmount: boolean
  isCategoryValid: boolean
  isDescriptionValid: boolean
  /** TODOS los faltantes, sin importar el paso. */
  missingFields: readonly AddExpenseField[]
  canContinue: boolean
  canSubmit: boolean
}

/**
 * Monto del gasto ya saneado. `parsePrice` devuelve NaN con el input vacío y
 * puede devolver negativos si alguien serializa a mano, así que el 0 es el
 * único valor "no cargado" que ve el resto del modelo.
 */
export function parseAddExpenseAmount(rawPrice: string): number {
  const parsed = parsePrice(rawPrice)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/**
 * Gates del wizard. Cada condición corresponde 1:1 con una entrada de
 * `missingFields`: si divergen, el CTA queda atenuado sin que ningún campo se
 * pinte y el usuario no tiene forma de saber qué falta. Al tocar una, tocar
 * la otra.
 */
export function evaluateAddExpenseGates(input: AddExpenseGatesInput): AddExpenseGates {
  const amount = parseAddExpenseAmount(input.rawPrice)
  const hasValidAmount = amount > 0
  const isCategoryValid = input.categoryId !== '' && input.isCategoryIdValid(input.categoryId)
  const isDescriptionValid = input.description.trim().length > 0

  const missingFields: AddExpenseField[] = []
  if (!hasValidAmount) missingFields.push('amount')
  if (!isCategoryValid) missingFields.push('category')
  if (!isDescriptionValid) missingFields.push('description')

  const canContinue = missingFields.length === 0
  // El paso 2 (notas + fecha) no agrega requisitos propios, así que confirmar
  // pide exactamente lo mismo que avanzar. Se deja explícito —y derivado de
  // `missingFieldsForStep`— para que agregar mañana un campo obligatorio al
  // paso 2 no requiera acordarse de tocar este gate.
  const canSubmit = canContinue && missingFieldsForStep(missingFields, 2).length === 0

  return {
    amount,
    hasValidAmount,
    isCategoryValid,
    isDescriptionValid,
    missingFields,
    canContinue,
    canSubmit,
  }
}

/** Filtra los faltantes que pertenecen a un paso. */
export function missingFieldsForStep(
  missingFields: readonly AddExpenseField[],
  step: AddExpenseStep,
): readonly AddExpenseField[] {
  return missingFields.filter((f) => FIELD_STEP[f] === step)
}

interface UseAddExpenseFormArgs {
  isCategoryIdValid: (id: string) => boolean
  /** Prefill del Asistente / OCR. Sólo semilla: después manda el usuario. */
  prefillAmount?: number
  prefillDescription?: string
  /**
   * Día al que se estampa el gasto ("registrar gasto olvidado" del calendario
   * de Gastos). `null` == hoy.
   */
  initialForDate?: Date | null
}

export interface AddExpenseFormState {
  step: AddExpenseStep
  /** `true` si avanzó al paso 2; `false` si marcó los faltantes y se quedó.
   *  El CTA nunca va `disabled` (ver `WizardCta`), así que el tap SIEMPRE
   *  llega acá: el "no" tiene que producir el resaltado, no silencio. */
  goNext: () => boolean
  /** `true` si retrocedió; `false` si ya estaba en el paso 1 (⇒ cerrar el
   *  alta). Mismo contrato que `useAddIncomeForm.goBack`, así las dos
   *  pantallas resuelven "atrás" con la misma línea. */
  goBack: () => boolean
  rawPrice: string
  setRawPrice: (v: string) => void
  amount: number
  categoryId: string
  setCategoryId: (v: string) => void
  description: string
  setDescription: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  forDate: Date | null
  setForDate: (v: Date | null) => void
  // ── Derived ──────────────────────────────────────────────────────
  canContinue: boolean
  canSubmit: boolean
  /** Todos los faltantes (para la línea "Completá monto y categoría…"). */
  missingFields: readonly AddExpenseField[]
  /** Los faltantes del paso ACTUAL. */
  stepMissingFields: readonly AddExpenseField[]
  /** Los del paso actual, sólo si el usuario ya tocó el CTA en ESE paso. */
  flaggedFields: readonly AddExpenseField[]
  isFieldFlagged: (field: AddExpenseField) => boolean
  /** Marca los faltantes del paso actual (CTA atenuado tocado). El háptico de
   *  advertencia lo dispara la screen: este modelo no importa react-native. */
  flagMissing: () => void
  // ── Affordances ──────────────────────────────────────────────────
  addQuickAmount: (delta: number) => void
  clearAmount: () => void
  /** Vuelve al estado inicial tras crear el gasto (el sheet queda montado). */
  reset: () => void
}

const NO_FLAGS: Record<AddExpenseStep, boolean> = { 1: false, 2: false }

/** Constante compartida: devolver `[]` literal cuando el paso no está marcado
 *  rompía la identidad de `flaggedFields` en cada render y con ella la del
 *  objeto del form. */
const NO_FIELDS: readonly AddExpenseField[] = []

export function useAddExpenseForm({
  isCategoryIdValid,
  prefillAmount,
  prefillDescription,
  initialForDate = null,
}: UseAddExpenseFormArgs): AddExpenseFormState {
  const [step, setStep] = useState<AddExpenseStep>(1)
  const [rawPrice, setRawPrice] = useState(
    prefillAmount != null && prefillAmount > 0 ? serializePrice(prefillAmount) : '',
  )
  // Nunca cae a `categories[0].id`: nominar la primera categoría como
  // "elección del usuario" dejaba guardar gastos mal categorizados sin que se
  // dieran cuenta (mismo agujero que se cerró en el wizard de import).
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState(prefillDescription ?? '')
  // Notas: contexto libre opcional. Siempre string (nunca null) para que el
  // TextInput quede controlado; el repositorio normaliza vacío → null.
  const [notes, setNotes] = useState('')
  const [forDate, setForDate] = useState<Date | null>(initialForDate)
  /**
   * Qué pasos ya recibieron un tap del CTA con datos faltantes.
   *
   * Es un registro POR PASO y vive acá arriba, no en la vista del paso: el
   * `useRef(highlightToken)` que usaba `add-expense-dashboard` se
   * re-inicializaba con cada montaje, así que volver del paso 2 al 1 (la vista
   * del paso 1 se remonta) reseteaba la referencia y el resaltado desaparecía
   * justo cuando el usuario venía a completar lo que faltaba.
   */
  const [flaggedSteps, setFlaggedSteps] = useState<Record<AddExpenseStep, boolean>>(NO_FLAGS)

  // Memoizado, y por eso `isCategoryIdValid` TIENE que llegar estable desde el
  // caller (la screen lo cuelga de `useCallback([categories])`). No es por
  // ahorrarse tres comparaciones: `missingFields` es un array nuevo por render,
  // y aguas arriba el objeto del form se memoiza contra él.
  const gates = useMemo(
    () => evaluateAddExpenseGates({ rawPrice, categoryId, description, isCategoryIdValid }),
    [rawPrice, categoryId, description, isCategoryIdValid],
  )
  const { amount, missingFields, canContinue, canSubmit } = gates

  const stepMissingFields = useMemo(
    () => missingFieldsForStep(missingFields, step),
    [missingFields, step],
  )
  const flaggedFields = useMemo(
    () => (flaggedSteps[step] ? stepMissingFields : NO_FIELDS),
    [flaggedSteps, step, stepMissingFields],
  )

  const flagMissing = useCallback(() => {
    setFlaggedSteps((prev) => (prev[step] ? prev : { ...prev, [step]: true }))
  }, [step])

  const goNext = useCallback(() => {
    if (!canContinue) {
      setFlaggedSteps((prev) => (prev[1] ? prev : { ...prev, 1: true }))
      return false
    }
    setStep(2)
    return true
  }, [canContinue])

  // Devuelve si HUBO retroceso: en el paso 1 "atrás" significa cerrar el alta,
  // y esa decisión es de la screen. Espeja a `useAddIncomeForm`.
  const goBack = useCallback(() => {
    if (step === 1) return false
    setStep(1)
    return true
  }, [step])

  const addQuickAmount = useCallback(
    (delta: number) => {
      setRawPrice(serializePrice(parseAddExpenseAmount(rawPrice) + delta))
    },
    [rawPrice],
  )
  const clearAmount = useCallback(() => {
    setRawPrice('')
  }, [])

  const reset = useCallback(() => {
    setStep(1)
    setRawPrice('')
    setCategoryId('')
    setDescription('')
    setNotes('')
    setForDate(initialForDate)
    setFlaggedSteps(NO_FLAGS)
  }, [initialForDate])

  const isFieldFlagged = useCallback(
    (field: AddExpenseField) => flaggedFields.includes(field),
    [flaggedFields],
  )

  // El objeto se MEMOIZA, igual que en `useAddIncomeForm`: la pantalla cuelga
  // media docena de `useCallback` de `[form]`, y un literal nuevo por render
  // los recreaba a todos con cada tecla de la descripción — lo que a su vez
  // derrota las memos aguas abajo (los tiles animados del rail se re-renderizan
  // por caracter tipeado). Ver la nota de memos derrotadas por callbacks
  // inestables.
  return useMemo(
    () => ({
      step,
      goNext,
      goBack,
      rawPrice,
      setRawPrice,
      amount,
      categoryId,
      setCategoryId,
      description,
      setDescription,
      notes,
      setNotes,
      forDate,
      setForDate,
      canContinue,
      canSubmit,
      missingFields,
      stepMissingFields,
      flaggedFields,
      isFieldFlagged,
      flagMissing,
      addQuickAmount,
      clearAmount,
      reset,
    }),
    [
      step,
      goNext,
      goBack,
      rawPrice,
      amount,
      categoryId,
      description,
      notes,
      forDate,
      canContinue,
      canSubmit,
      missingFields,
      stepMissingFields,
      flaggedFields,
      isFieldFlagged,
      flagMissing,
      addQuickAmount,
      clearAmount,
      reset,
    ],
  )
}
