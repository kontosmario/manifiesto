// Hook con todo el state + validación del wizard add-fijo. Extraído de
// `add-fijo-v2-screen.tsx` para que la screen sea sólo composición:
// monta los step views, recibe el state machine aquí y delega los
// callbacks.
//
// Mantiene EXACTAMENTE la misma lógica del screen pre-refactor:
//  · Hidratación de form state al cargar un fijo existente (edit mode).
//  · `canContinue` (step 1) gate + `canSubmit` (step 2 → day picked).
//  · Missing-fields flags (nombre / monto / categoría / frecuencia)
//    para el `warning` glide de cada input cuando el user toca el CTA
//    con el form incompleto.
import { useEffect, useMemo, useState } from 'react'
import { Keyboard } from 'react-native'
import { parsePrice, serializePrice } from '@/utils/money'
import { triggerHaptic } from '@/lib/haptics'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import {
  findDuplicateFijoName,
  normalizeFijoName,
  type FreqChoice,
} from './add-fijo-helpers'

/**
 * Largo mínimo del nombre, ya trimmeado. Con 1 carácter el gate pasaba y se
 * creaba un fijo llamado "a" — un ítem que después no se puede identificar en
 * la lista ni en un push. Dos es el piso de algo pronunciable ("TV", "Luz").
 */
const MIN_NAME_LENGTH = 2
/** Día del mes válido. El picker sólo ofrece 1-31, pero el gate no puede
 *  depender de que el picker sea el único que escribe `day`. */
const MIN_DAY = 1
const MAX_DAY = 31

interface UseAddFijoFormArgs {
  fixedExpenseId?: string
  prefillAmount?: number
  prefillDescription?: string
  /** El fijo a editar — al hidratarse, se popula el form con sus
   *  valores. `null` cuando estamos en modo create. */
  editingFijo: FixedExpense | null
  /**
   * Fijos existentes de la familia, para el gate de nombre duplicado. El
   * alta aceptaba "Alquiler" dos veces sin aviso; ahora `canContinue`
   * bloquea y el paso 1 muestra el error inline. La comparación normaliza
   * mayúsculas/espacios/tildes y excluye al propio `fixedExpenseId` en
   * edición (guardar sin renombrar no se bloquea a sí mismo).
   */
  existingFijos: ReadonlyArray<{ id: string; name: string }>
  /**
   * Si un `categoryId` EXISTE entre las categorías cargadas. Lo resuelve la
   * screen, que es la que tiene la query.
   *
   * Sin esto el gate se contentaba con `categoryId !== null`, y eso deja pasar
   * un id que ya no resuelve —categoría borrada por otro miembro, query todavía
   * cargando, prefill del Asistente con un id viejo—. El CTA se veía habilitado,
   * el usuario lo tocaba y `handleConfirm` volvía en silencio contra su propio
   * `if (!selectedCategory) return`: un botón muerto sin explicación.
   *
   * Va como función y no como booleano para que el hook siga siendo dueño del
   * `categoryId`: espejarlo en la screen metía un render de lag.
   */
  isCategoryIdValid: (id: string) => boolean
}

export interface AddFijoFormState {
  step: 1 | 2
  setStep: (s: 1 | 2) => void
  name: string
  setName: (v: string) => void
  rawAmount: string
  setRawAmount: (v: string) => void
  amount: number
  categoryId: string | null
  setCategoryId: (v: string | null) => void
  freqChoice: FreqChoice | null
  setFreqChoice: (v: FreqChoice | null) => void
  cuotaTot: number
  setCuotaTot: (n: number) => void
  day: number | null
  setDay: (n: number | null) => void
  notify: boolean
  setNotify: (v: boolean | ((prev: boolean) => boolean)) => void
  alreadyPaidCurrentCuota: boolean
  setAlreadyPaidCurrentCuota: (v: boolean | ((prev: boolean) => boolean)) => void
  isNumpadVisible: boolean
  setIsNumpadVisible: (v: boolean) => void
  isNameFocused: boolean
  setIsNameFocused: (v: boolean) => void
  // ── Derived ───────────────────────────────────────────────────
  isInstallment: boolean
  totalCuotas: number
  /** El nombre tipeado ya existe en otro fijo de la familia. Cue VIVO
   *  (no espera el tap del CTA): el error inline del paso 1 se muestra
   *  apenas se detecta, y `canContinue` bloquea el avance. */
  isNameDuplicate: boolean
  canContinue: boolean
  canSubmit: boolean
  // ── Missing-fields highlight ─────────────────────────────────
  flagName: boolean
  flagAmount: boolean
  flagCategory: boolean
  flagFrequency: boolean
  /** Paso 2: el día no está elegido y el usuario ya intentó confirmar. */
  flagDay: boolean
  flagMissing: () => void
  // ── UI affordances ────────────────────────────────────────────
  dismissNameKeyboard: () => void
  addQuickAmount: (delta: number) => void
  clearAmount: () => void
  openNumpad: () => void
}

export function useAddFijoForm({
  fixedExpenseId,
  prefillAmount,
  prefillDescription,
  editingFijo,
  existingFijos,
  isCategoryIdValid,
}: UseAddFijoFormArgs): AddFijoFormState {
  // Seed del prefill (Asistente "undetected-sub") solo en modo create.
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState(
    !fixedExpenseId && prefillDescription ? prefillDescription : '',
  )
  const [rawAmount, setRawAmount] = useState(
    !fixedExpenseId && prefillAmount && prefillAmount > 0
      ? serializePrice(prefillAmount)
      : '',
  )
  const [categoryId, setCategoryId] = useState<string | null>(null)
  // No pre-selected frequency. El user tiene que elegir explícitamente —
  // misma data-integrity stance que add-expense / add-income usan para
  // category / kind.
  const [freqChoice, setFreqChoice] = useState<FreqChoice | null>(null)
  const [cuotaTot, setCuotaTot] = useState(12)
  // No default day on create. Forzar al user a elegir previene el reflex
  // de "le doy confirm sin chequear" — la calendar card pulsa hasta que
  // hay un día seleccionado y el CTA del step 2 está gated.
  const [day, setDay] = useState<number | null>(null)
  const [notify, setNotify] = useState(true)
  const [alreadyPaidCurrentCuota, setAlreadyPaidCurrentCuota] = useState(false)
  const [isNumpadVisible, setIsNumpadVisible] = useState(false)
  const [isNameFocused, setIsNameFocused] = useState(false)
  const [hydratedFromFijoId, setHydratedFromFijoId] = useState<string | null>(null)

  const parsedAmount = parsePrice(rawAmount)
  const amount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0

  // Hidratación del state desde el fijo a editar, una sola vez por id.
  //
  // El `setState` en efecto es DELIBERADO y está guardado por
  // `hydratedFromFijoId`: corre una vez por fijo editado y no se re-dispara.
  // No es derivable en render porque después el usuario edita esos campos —
  // el fijo es la semilla, no la fuente de verdad.
  //
  // (La regla no lo marcaba hasta ahora porque el `useRef` que vivía más
  // abajo hacía que el analizador se salteara el componente entero.)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!editingFijo || editingFijo.id === hydratedFromFijoId) return
    setName(editingFijo.name)
    setRawAmount(serializePrice(Number(editingFijo.amount ?? 0)))
    setCategoryId(editingFijo.category_id)
    if (editingFijo.kind === 'installment') {
      setFreqChoice('cuotas')
      setCuotaTot(editingFijo.installments_total ?? 12)
    } else {
      setFreqChoice(editingFijo.frequency)
    }
    setDay(editingFijo.day_of_month ?? new Date().getUTCDate())
    setNotify(editingFijo.notify_days_before != null)
    setHydratedFromFijoId(editingFijo.id)
  }, [editingFijo, hydratedFromFijoId])
  /* eslint-enable react-hooks/set-state-in-effect */

  const isInstallment = freqChoice === 'cuotas'
  const totalCuotas = isInstallment ? amount * cuotaTot : 0

  // ── Gates ────────────────────────────────────────────────────────────
  const isNameValid = name.trim().length >= MIN_NAME_LENGTH
  // Nombre repetido contra los fijos existentes visibles (normalizado;
  // excluye al propio en edición). Si el nombre quedó IGUAL al original del
  // fijo editado, no hay duplicado que reportar: dos fijos legacy con el
  // mismo nombre (pre-validador) no pueden trabar la edición de campos
  // ajenos al nombre. N chico (fijos de una familia) → sin memo.
  const keepsOriginalName =
    editingFijo != null &&
    normalizeFijoName(name) === normalizeFijoName(editingFijo.name)
  const isNameDuplicate =
    !keepsOriginalName &&
    findDuplicateFijoName(name, existingFijos, fixedExpenseId) !== null
  // Con `cuotas`, la cantidad es parte de la definición del fijo: sin ella el
  // payload va con `installmentsTotal` inválido.
  const isCuotasValid = !isInstallment || (Number.isInteger(cuotaTot) && cuotaTot > 0)
  const isDayValid = day != null && Number.isInteger(day) && day >= MIN_DAY && day <= MAX_DAY
  const isCategoryValid = categoryId !== null && isCategoryIdValid(categoryId)

  // Missing-fields del step 1 — feedea el warning glide y es LA fuente del
  // gate: `canContinue` se DERIVA de esta lista (regla 3 de
  // docs/sistemas/form-validation-pattern.md — una sola fuente de verdad).
  // Con dos contabilidades separadas, una condición agregada solo al gate
  // dejaba el CTA bloqueado sin que ningún campo se pintara.
  const missingFieldsStep1 = useMemo<string[]>(() => {
    const missing: string[] = []
    // Duplicado también pinta 'nombre' (además del error inline vivo).
    if (!isNameValid || isNameDuplicate) missing.push('nombre')
    if (amount <= 0) missing.push('monto')
    if (!isCategoryValid) missing.push('categoría')
    if (freqChoice === null || !isCuotasValid) missing.push('frecuencia')
    return missing
  }, [isNameValid, isNameDuplicate, amount, isCategoryValid, freqChoice, isCuotasValid])

  const canContinue = missingFieldsStep1.length === 0
  // Step-2 gate: day must be picked before el user puede confirmar.
  // Step 1 no depende del day (elegido en step 2 al lado del calendar
  // preview).
  const canSubmit = canContinue && isDayValid
  // El aviso es POR PASO. Con un token global, alguien que tocaba el CTA
  // bloqueado en el paso 1 llegaba al paso 2 con el calendario ya marcado en
  // rojo antes de haber hecho nada ahí: el cue dejaba de significar "esto te
  // falta" y pasaba a ser decoración.
  const [flaggedStep, setFlaggedStep] = useState<1 | 2 | null>(null)
  const isFlagged = flaggedStep === step
  const flagName = isFlagged && missingFieldsStep1.includes('nombre')
  const flagAmount = isFlagged && missingFieldsStep1.includes('monto')
  const flagCategory = isFlagged && missingFieldsStep1.includes('categoría')
  const flagFrequency = isFlagged && missingFieldsStep1.includes('frecuencia')
  // El paso 2 tenía el gate (`day != null`) pero NINGÚN cue: tocar el CTA
  // disparaba el háptico de error y no se pintaba nada, porque `flagMissing`
  // sólo alimentaba campos del paso 1. El calendario ahora también se marca.
  const flagDay = isFlagged && !isDayValid

  const flagMissing = () => {
    void triggerHaptic('warning')
    setFlaggedStep(step)
  }

  // Any interaction with the form's other controls should release the
  // name input's focus and close the keyboard — el user moved on.
  const dismissNameKeyboard = () => {
    Keyboard.dismiss()
  }
  const addQuickAmount = (delta: number) => {
    dismissNameKeyboard()
    setRawAmount(serializePrice(amount + delta))
  }
  const clearAmount = () => {
    dismissNameKeyboard()
    setRawAmount('')
  }
  const openNumpad = () => {
    dismissNameKeyboard()
    void triggerHaptic('selection')
    setIsNumpadVisible(true)
  }

  return {
    step,
    setStep,
    name,
    setName,
    rawAmount,
    setRawAmount,
    amount,
    categoryId,
    setCategoryId,
    freqChoice,
    setFreqChoice,
    cuotaTot,
    setCuotaTot,
    day,
    setDay,
    notify,
    setNotify,
    alreadyPaidCurrentCuota,
    setAlreadyPaidCurrentCuota,
    isNumpadVisible,
    setIsNumpadVisible,
    isNameFocused,
    setIsNameFocused,
    isInstallment,
    totalCuotas,
    isNameDuplicate,
    canContinue,
    canSubmit,
    flagName,
    flagAmount,
    flagCategory,
    flagFrequency,
    flagDay,
    flagMissing,
    dismissNameKeyboard,
    addQuickAmount,
    clearAmount,
    openNumpad,
  }
}
