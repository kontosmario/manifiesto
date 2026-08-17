/**
 * Estado del alta "agregar gasto". SOLO state + gates: es el modelo de una
 * pantalla ÚNICA, no de un wizard.
 *
 * Por qué ya no hay pasos (2026-08-17)
 * ------------------------------------
 * El alta era un wizard de 2 pasos y el segundo no agregaba NINGÚN requisito:
 * `canSubmit` se evaluaba idéntico a `canContinue` porque los campos del paso 2
 * (nota y fecha) eran opcionales o de sólo lectura. O sea que el paso existía
 * para mostrar el impacto, y cobraba un tap de CTA por hacerlo. El impacto pasó
 * a una tira compacta EN VIVO arriba del CTA, y con eso el segundo paso —y su
 * máquina de estados— se quedaron sin razón de ser.
 *
 * Lo que se fue con él: `AddExpenseStep`, `missingFieldsForStep`, `canContinue`,
 * `goNext`/`goBack` y el registro de "qué pasos ya recibieron un tap del CTA".
 * Queda UN gate (`canSubmit`) derivado de `missingFields`, que es la regla 3 de
 * `docs/sistemas/form-validation-pattern.md`: una sola fuente de verdad, para
 * que agregar mañana un campo requerido no pueda dejar el CTA y la línea que
 * enumera los faltantes contando cosas distintas.
 *
 * Qué NO hace (a propósito):
 *  · No trae categorías ni gastos, no muta nada, no toca haptics ni teclado.
 *    Los datos y la mutación siguen viviendo en `use-add-expense-controller`
 *    (categorías rankeadas, sugerencias, `createExpenseMutation`); este hook
 *    es el que decide QUÉ falta y CUÁNDO se puede confirmar. Duplicarle la
 *    query o la mutation sería partir la lógica de negocio en dos.
 *  · No importa nada de `react-native`: la parte derivable
 *    (`evaluateAddExpenseGates`) tiene que poder correr en vitest env node, que
 *    no tiene renderer de React — por eso los gates son funciones puras
 *    exportadas y el hook es una cáscara delgada sobre ellas.
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

/** Campos REQUERIDOS del alta. El orden es el de aparición en la columna
 *  (monto → categoría → descripción): la línea "Completá …" lee en el mismo
 *  orden en que el usuario recorre el formulario. */
export type AddExpenseField = 'amount' | 'category' | 'description'

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
  /** Todos los requeridos que faltan. */
  missingFields: readonly AddExpenseField[]
  /** ÚNICO gate del alta, derivado de `missingFields`. */
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
 * Gates del alta. Cada condición corresponde 1:1 con una entrada de
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

  return {
    amount,
    hasValidAmount,
    isCategoryValid,
    isDescriptionValid,
    missingFields,
    // Regla 3 del patrón de validación: UNA sola fuente de verdad. No se
    // deriva de un `&&` de condiciones sueltas, que es lo que hace que un
    // campo requerido nuevo entre en la lista y no en el gate.
    canSubmit: missingFields.length === 0,
  }
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
  /** ÚNICO gate: `missingFields.length === 0`. El CTA nunca va `disabled`
   *  (ver `WizardCta`), así que el tap SIEMPRE llega a la screen: el "no"
   *  tiene que producir el resaltado, no silencio. */
  canSubmit: boolean
  /** Todos los faltantes (para la línea "Completá monto y categoría…"). */
  missingFields: readonly AddExpenseField[]
  /** Los faltantes, sólo si el usuario ya tocó el CTA atenuado. */
  flaggedFields: readonly AddExpenseField[]
  isFieldFlagged: (field: AddExpenseField) => boolean
  /** Marca los faltantes (CTA atenuado tocado). El háptico de advertencia lo
   *  dispara la screen: este modelo no importa react-native. */
  flagMissing: () => void
  // ── Affordances ──────────────────────────────────────────────────
  addQuickAmount: (delta: number) => void
  clearAmount: () => void
  /** Vuelve al estado inicial tras crear el gasto (el sheet queda montado). */
  reset: () => void
}

/** Constante compartida: devolver `[]` literal cuando todavía no se marcó nada
 *  rompía la identidad de `flaggedFields` en cada render y con ella la del
 *  objeto del form. */
const NO_FIELDS: readonly AddExpenseField[] = []

export function useAddExpenseForm({
  isCategoryIdValid,
  prefillAmount,
  prefillDescription,
  initialForDate = null,
}: UseAddExpenseFormArgs): AddExpenseFormState {
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
   * Si el usuario ya tocó el CTA con datos faltantes.
   *
   * Vive acá arriba y no en la vista: el `useRef(highlightToken)` que usaba
   * `add-expense-dashboard` se re-inicializaba con cada montaje, así que
   * cualquier remontaje del cuerpo reseteaba la referencia y el resaltado
   * desaparecía justo cuando el usuario venía a completar lo que faltaba.
   */
  const [isFlagged, setIsFlagged] = useState(false)

  // Memoizado, y por eso `isCategoryIdValid` TIENE que llegar estable desde el
  // caller (la screen lo cuelga de `useCallback([categories])`). No es por
  // ahorrarse tres comparaciones: `missingFields` es un array nuevo por render,
  // y aguas arriba el objeto del form se memoiza contra él.
  const gates = useMemo(
    () => evaluateAddExpenseGates({ rawPrice, categoryId, description, isCategoryIdValid }),
    [rawPrice, categoryId, description, isCategoryIdValid],
  )
  const { amount, missingFields, canSubmit } = gates

  const flaggedFields = useMemo(
    () => (isFlagged ? missingFields : NO_FIELDS),
    [isFlagged, missingFields],
  )

  // `setState` con el MISMO valor no re-rendea (React corta por Object.is), así
  // que tocar el CTA atenuado dos veces seguidas no cuesta un render.
  const flagMissing = useCallback(() => {
    setIsFlagged(true)
  }, [])

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
    setRawPrice('')
    setCategoryId('')
    setDescription('')
    setNotes('')
    setForDate(initialForDate)
    setIsFlagged(false)
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
      canSubmit,
      missingFields,
      flaggedFields,
      isFieldFlagged,
      flagMissing,
      addQuickAmount,
      clearAmount,
      reset,
    }),
    [
      rawPrice,
      amount,
      categoryId,
      description,
      notes,
      forDate,
      canSubmit,
      missingFields,
      flaggedFields,
      isFieldFlagged,
      flagMissing,
      addQuickAmount,
      clearAmount,
      reset,
    ],
  )
}
