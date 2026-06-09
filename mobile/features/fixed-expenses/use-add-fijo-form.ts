// Hook con todo el state + validación del wizard add-fijo. Extraído de
// `add-fijo-v2-screen.tsx` para que la screen sea sólo composición:
// monta los step views, recibe el state machine acá y delega los
// callbacks.
//
// Mantiene EXACTAMENTE la misma lógica del screen pre-refactor:
//  · Hidratación de form state al cargar un fijo existente (edit mode).
//  · `canContinue` (step 1) gate + `canSubmit` (step 2 → day picked).
//  · Missing-fields flags (nombre / monto / categoría / frecuencia)
//    para el `warning` glide de cada input cuando el user toca el CTA
//    con el form incompleto.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard } from 'react-native'
import { parsePrice, serializePrice } from '@/utils/money'
import { triggerHaptic } from '@/lib/haptics'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import type { FreqChoice } from './add-fijo-helpers'

interface UseAddFijoFormArgs {
  fixedExpenseId?: string
  prefillAmount?: number
  prefillDescription?: string
  /** El fijo a editar — al hidratarse, se popula el form con sus
   *  valores. `null` cuando estamos en modo create. */
  editingFijo: FixedExpense | null
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
  canContinue: boolean
  canSubmit: boolean
  // ── Missing-fields highlight ─────────────────────────────────
  flagName: boolean
  flagAmount: boolean
  flagCategory: boolean
  flagFrequency: boolean
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

  const isInstallment = freqChoice === 'cuotas'
  const totalCuotas = isInstallment ? amount * cuotaTot : 0

  const canContinue =
    amount > 0 &&
    categoryId !== null &&
    name.trim().length > 0 &&
    freqChoice !== null
  // Step-2 gate: day must be picked before el user puede confirmar.
  // Step 1 no depende del day (elegido en step 2 al lado del calendar
  // preview).
  const canSubmit = canContinue && day != null

  // Missing-fields del step 1 — feedea el warning glide. Step 2 sólo
  // tiene el day picker, que ya lleva su propio copy-driven cue
  // ("Elige el día del mes") via el bespoke CTA — no necesita un missing
  // fields list aparte.
  const missingFieldsStep1 = useMemo<string[]>(() => {
    const missing: string[] = []
    if (name.trim().length === 0) missing.push('nombre')
    if (amount <= 0) missing.push('monto')
    if (categoryId === null) missing.push('categoría')
    if (freqChoice === null) missing.push('frecuencia')
    return missing
  }, [name, amount, categoryId, freqChoice])
  const [highlightToken, setHighlightToken] = useState(0)
  const initialTokenRef = useRef(highlightToken)
  const isFlagged = highlightToken > initialTokenRef.current
  const flagName = isFlagged && missingFieldsStep1.includes('nombre')
  const flagAmount = isFlagged && missingFieldsStep1.includes('monto')
  const flagCategory = isFlagged && missingFieldsStep1.includes('categoría')
  const flagFrequency = isFlagged && missingFieldsStep1.includes('frecuencia')

  const flagMissing = () => {
    void triggerHaptic('warning')
    setHighlightToken((t) => t + 1)
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
    canContinue,
    canSubmit,
    flagName,
    flagAmount,
    flagCategory,
    flagFrequency,
    flagMissing,
    dismissNameKeyboard,
    addQuickAmount,
    clearAmount,
    openNumpad,
  }
}
