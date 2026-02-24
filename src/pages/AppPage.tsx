import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  IonAlert,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonPopover,
  IonSpinner,
  IonText,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import {
  addOutline,
  calendarOutline,
  cashOutline,
  copyOutline,
  ellipsisVerticalOutline,
  createOutline,
  logOutOutline,
  menuOutline,
  notificationsOutline,
  pencilOutline,
  removeCircle,
  shieldCheckmarkOutline,
  statsChartOutline,
  trendingUpOutline,
  trashOutline,
  walletOutline,
} from 'ionicons/icons'
import { useHistory } from 'react-router-dom'
import { useAuthSession } from '../hooks/useAuthSession'
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
  type Category,
} from '../hooks/useCategories'
import {
  useClearFamilyExpenses,
  useCreateExpense,
  useDeleteExpense,
  useExpenses,
  useFamilyMonthlySpent,
  useFamilyPeriodTotal,
  useFamilyTotal,
  useUpdateExpense,
  type Expense,
} from '../hooks/useExpenses'
import {
  DEFAULT_SALARY_PAYMENT_DAY,
  DEFAULT_USD_EXCHANGE_RATE,
  useFamilyFinance,
  useUpsertFamilyFinance,
} from '../hooks/useFamilyFinance'
import {
  useFixedExpenses,
  type FixedExpense,
} from '../hooks/useFixedExpenses'
import {
  useFamilyNotifications,
  useFamilyNotificationsRealtime,
  type FamilyNotification,
} from '../hooks/useNotifications'
import {
  useEnablePushNotifications,
  useHasPushSubscription,
} from '../hooks/usePushNotifications'
import { useFamily } from '../hooks/useFamily'
import { useMyProfile, useUpdateDisplayName } from '../hooks/useProfile'
import { supabase } from '../lib/supabaseClient'
import './pages.css'

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    return error.message
  }
  return fallbackMessage
}

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
})

const usdFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
})

const usdInputFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const currencyInputFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const integerInputFormatter = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
})

const shortDateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
})

const monthYearFormatter = new Intl.DateTimeFormat('es-AR', {
  month: 'long',
  year: 'numeric',
})

const notificationDateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

type MoneyCurrency = 'ARS' | 'USD'
type FinanceEditorMetric = 'income' | 'savings'

interface PayCycle {
  start: Date
  end: Date
  weeks: number
  days: number
}

function normalizeToStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function capitalizeText(value: string): string {
  if (!value) {
    return value
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function moveToNextBusinessDay(date: Date): Date {
  const next = normalizeToStartOfDay(date)

  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1)
  }

  return next
}

function buildPayDate(year: number, month: number, paymentDay: number): Date {
  const monthLastDay = new Date(year, month + 1, 0).getDate()
  const normalizedPaymentDay = Math.min(Math.max(1, paymentDay), monthLastDay)
  return moveToNextBusinessDay(new Date(year, month, normalizedPaymentDay))
}

function getCurrentPayCycle(
  referenceDate: Date,
  paymentDay: number,
  freezeUntilSalaryConfirmation = false,
): PayCycle {
  const today = normalizeToStartOfDay(referenceDate)
  const currentMonthPayDate = buildPayDate(
    today.getFullYear(),
    today.getMonth(),
    paymentDay,
  )

  const cycleStart =
    freezeUntilSalaryConfirmation && today >= currentMonthPayDate
      ? buildPayDate(today.getFullYear(), today.getMonth() - 1, paymentDay)
      : today >= currentMonthPayDate
        ? currentMonthPayDate
        : buildPayDate(today.getFullYear(), today.getMonth() - 1, paymentDay)
  const cycleEnd =
    freezeUntilSalaryConfirmation && today >= currentMonthPayDate
      ? currentMonthPayDate
      : buildPayDate(cycleStart.getFullYear(), cycleStart.getMonth() + 1, paymentDay)

  const cycleDays = Math.max(
    1,
    Math.round((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)),
  )
  const cycleWeeks = Math.max(1, Math.ceil(cycleDays / 7))

  return {
    start: cycleStart,
    end: cycleEnd,
    weeks: cycleWeeks,
    days: cycleDays,
  }
}

function normalizePriceInput(rawValue: string): string {
  const cleaned = rawValue.replace(/[^\d.,]/g, '')
  if (!cleaned) {
    return ''
  }

  const commaIndex = cleaned.indexOf(',')

  let integerPart = commaIndex >= 0 ? cleaned.slice(0, commaIndex) : cleaned
  let decimalPart = commaIndex >= 0 ? cleaned.slice(commaIndex + 1) : ''

  integerPart = integerPart.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '')
  if (!integerPart) {
    integerPart = '0'
  }

  decimalPart = decimalPart.replace(/[^\d]/g, '').slice(0, 2)

  if (commaIndex >= 0) {
    return decimalPart ? `${integerPart},${decimalPart}` : `${integerPart},`
  }

  return integerPart
}

function parsePrice(rawValue: string): number {
  const normalized = normalizePriceInput(rawValue)
  if (!normalized) {
    return Number.NaN
  }

  const safeValue = normalized.endsWith(',') ? normalized.slice(0, -1) : normalized
  return Number(safeValue.replace(',', '.'))
}

function formatPriceInputValue(
  rawValue: string,
  isFocused: boolean,
  currency: MoneyCurrency = 'ARS',
): string {
  if (!rawValue) {
    return ''
  }

  const normalized = normalizePriceInput(rawValue)
  if (!normalized) {
    return ''
  }

  const hasTrailingDecimalSeparator = normalized.endsWith(',')
  const [integerPart = '0', decimalPart = ''] = normalized.split(',')
  const integerValue = Number(integerPart)

  if (!Number.isFinite(integerValue)) {
    return ''
  }

  if (isFocused) {
    const formattedInteger = integerInputFormatter.format(integerValue)
    const focusedPrefix = currency === 'USD' ? 'US$ ' : '$ '
    return hasTrailingDecimalSeparator || decimalPart
      ? `${focusedPrefix}${formattedInteger},${decimalPart}`
      : `${focusedPrefix}${formattedInteger}`
  }

  const normalizedForParsing = hasTrailingDecimalSeparator
    ? `${integerPart}.${decimalPart || '0'}`
    : normalized
  const parsed = Number(normalizedForParsing)
  if (!Number.isFinite(parsed)) {
    return ''
  }

  return (currency === 'USD' ? usdInputFormatter : currencyInputFormatter).format(parsed)
}

function serializePrice(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString()
  }

  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',')
}

function formatUsdFromArs(arsValue: number, usdExchangeRate: number): string {
  if (!Number.isFinite(arsValue) || !Number.isFinite(usdExchangeRate) || usdExchangeRate <= 0) {
    return usdFormatter.format(0)
  }

  return usdFormatter.format(arsValue / usdExchangeRate)
}

function normalizeHexColor(color: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#126782'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex)
  const value = normalized.slice(1)

  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)

  if (![r, g, b].every(Number.isFinite)) {
    return null
  }

  return { r, g, b }
}

function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) {
    return `rgba(18, 103, 130, ${alpha})`
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

function shiftHexColor(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) {
    return '#126782'
  }

  const shift = (value: number) => Math.max(0, Math.min(255, value + amount))
  const toHex = (value: number) => value.toString(16).padStart(2, '0')

  return `#${toHex(shift(rgb.r))}${toHex(shift(rgb.g))}${toHex(shift(rgb.b))}`
}

function buildCategoryTabStyle(color: string): CSSProperties {
  const accent = normalizeHexColor(color)

  return {
    '--category-tab-border': hexToRgba(accent, 0.24),
    '--category-tab-bg': hexToRgba(accent, 0.1),
    '--category-tab-active-start': shiftHexColor(accent, -4),
    '--category-tab-active-end': shiftHexColor(accent, -16),
    '--category-tab-shadow': hexToRgba(accent, 0.24),
  } as CSSProperties
}

function convertCurrencyAmount(
  amount: number,
  fromCurrency: MoneyCurrency,
  toCurrency: MoneyCurrency,
  usdExchangeRate: number,
): number {
  if (!Number.isFinite(amount) || !Number.isFinite(usdExchangeRate) || usdExchangeRate <= 0) {
    return Number.NaN
  }

  if (fromCurrency === toCurrency) {
    return amount
  }

  if (fromCurrency === 'USD' && toCurrency === 'ARS') {
    return amount * usdExchangeRate
  }

  return amount / usdExchangeRate
}

const EMPTY_CATEGORIES: Category[] = []
const EMPTY_EXPENSES: Expense[] = []
const EMPTY_FIXED_EXPENSES: FixedExpense[] = []
const EMPTY_NOTIFICATIONS: FamilyNotification[] = []

function notificationKindLabel(kind: string): string {
  switch (kind) {
    case 'expense':
      return 'Gasto'
    case 'fixed_expense':
      return 'Fijo'
    default:
      return 'Info'
  }
}

function formatNotificationDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin fecha'
  }

  return notificationDateTimeFormatter.format(parsed)
}

export default function AppPage() {
  const history = useHistory()

  const { data: session } = useAuthSession()
  const userId = session?.user.id

  const { data: family } = useFamily(userId)
  const familyId = family?.familyId
  const familyCode = family?.familyCode ?? ''

  const profileQuery = useMyProfile(userId)
  const displayName = profileQuery.data?.display_name ?? 'Usuario'

  const categoriesQuery = useCategories(familyId)
  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES
  const categoryTabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const [categorySelection, setCategorySelection] = useState<string>('')

  const selectedCategoryId = useMemo(() => {
    if (categories.length === 0) {
      return ''
    }

    const selectedStillExists = categories.some(
      (category) => category.id === categorySelection,
    )

    return selectedStillExists ? categorySelection : categories[0].id
  }, [categories, categorySelection])
  const activeCategoryColor = useMemo(() => {
    const activeCategory = categories.find((category) => category.id === selectedCategoryId)
    return activeCategory?.color ?? categories[0]?.color ?? '#7FA8C9'
  }, [categories, selectedCategoryId])

  const expensesQuery = useExpenses(familyId, selectedCategoryId || undefined)
  const expenses = expensesQuery.data ?? EMPTY_EXPENSES
  const fixedExpensesQuery = useFixedExpenses(familyId)
  const fixedExpenses = fixedExpensesQuery.data ?? EMPTY_FIXED_EXPENSES
  const notificationsQuery = useFamilyNotifications(familyId, 40)
  const notifications = notificationsQuery.data ?? EMPTY_NOTIFICATIONS
  useFamilyNotificationsRealtime(familyId)
  const hasPushSubscriptionQuery = useHasPushSubscription(familyId, userId)
  const enablePushMutation = useEnablePushNotifications()
  const familyTotalQuery = useFamilyTotal(familyId)
  const familyFinanceQuery = useFamilyFinance(familyId)
  const salaryPaymentDay =
    familyFinanceQuery.data?.salary_payment_day ?? DEFAULT_SALARY_PAYMENT_DAY
  const todayDate = normalizeToStartOfDay(new Date())
  const currentMonthPayDate = buildPayDate(
    todayDate.getFullYear(),
    todayDate.getMonth(),
    salaryPaymentDay,
  )
  const lastSalaryConfirmedAt = familyFinanceQuery.data?.last_salary_confirmed_at ?? null
  const lastSalaryConfirmedDate = useMemo(() => {
    if (!lastSalaryConfirmedAt) {
      return null
    }

    const parsedDate = new Date(lastSalaryConfirmedAt)
    if (Number.isNaN(parsedDate.getTime())) {
      return null
    }

    return normalizeToStartOfDay(parsedDate)
  }, [lastSalaryConfirmedAt])
  const isSalaryPendingConfirmation =
    !familyFinanceQuery.isLoading &&
    todayDate >= currentMonthPayDate &&
    (!lastSalaryConfirmedDate || lastSalaryConfirmedDate < currentMonthPayDate)
  const payCycle = getCurrentPayCycle(todayDate, salaryPaymentDay, isSalaryPendingConfirmation)
  const familyPeriodTotalQuery = useFamilyPeriodTotal(
    familyId,
    payCycle.start.toISOString(),
    payCycle.end.toISOString(),
  )
  const monthlyHistoryQuery = useFamilyMonthlySpent(familyId, 6)
  const upsertFamilyFinanceMutation = useUpsertFamilyFinance(familyId)

  const createExpenseMutation = useCreateExpense(familyId, userId)
  const updateExpenseMutation = useUpdateExpense(familyId)
  const deleteExpenseMutation = useDeleteExpense(familyId)
  const clearFamilyExpensesMutation = useClearFamilyExpenses(familyId)

  const createCategoryMutation = useCreateCategory(familyId)
  const renameCategoryMutation = useRenameCategory(familyId)
  const deleteCategoryMutation = useDeleteCategory(familyId)

  const updateDisplayNameMutation = useUpdateDisplayName(userId)

  const [newDescription, setNewDescription] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [isNewPriceFocused, setNewPriceFocused] = useState(false)

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [editingDescription, setEditingDescription] = useState('')
  const [editingPrice, setEditingPrice] = useState('')
  const [isEditingPriceFocused, setEditingPriceFocused] = useState(false)

  const [isCategoriesModalOpen, setCategoriesModalOpen] = useState(false)
  const [isAddExpenseModalOpen, setAddExpenseModalOpen] = useState(false)
  const [isNewCategoryAlertOpen, setNewCategoryAlertOpen] = useState(false)
  const [renameTargetCategory, setRenameTargetCategory] = useState<Category | null>(null)
  const [isDisplayNameAlertOpen, setDisplayNameAlertOpen] = useState(false)
  const [financeEditorMetric, setFinanceEditorMetric] = useState<FinanceEditorMetric | null>(null)
  const [financeEditorCurrency, setFinanceEditorCurrency] = useState<MoneyCurrency>('ARS')
  const [financeEditorAmount, setFinanceEditorAmount] = useState('')
  const [isFinanceEditorAmountFocused, setFinanceEditorAmountFocused] = useState(false)
  const [isUsdRateModalOpen, setUsdRateModalOpen] = useState(false)
  const [usdRateInput, setUsdRateInput] = useState('')
  const [isUsdRateInputFocused, setUsdRateInputFocused] = useState(false)
  const [isSalaryDayModalOpen, setSalaryDayModalOpen] = useState(false)
  const [salaryDayInput, setSalaryDayInput] = useState('')
  const [isNotificationsModalOpen, setNotificationsModalOpen] = useState(false)
  const [isMonthlyHistoryModalOpen, setMonthlyHistoryModalOpen] = useState(false)
  const [dismissedSalaryPromptDate, setDismissedSalaryPromptDate] = useState<string | null>(
    null,
  )
  const [isManualSalaryConfirmationOpen, setManualSalaryConfirmationOpen] = useState(false)
  const [familyMenuEvent, setFamilyMenuEvent] = useState<Event | undefined>()
  const [expenseMenuEvent, setExpenseMenuEvent] = useState<Event | undefined>()
  const [expenseMenuTarget, setExpenseMenuTarget] = useState<Expense | null>(null)

  const [toastMessage, setToastMessage] = useState('')
  const [isToastOpen, setToastOpen] = useState(false)

  const totalForCategory = useMemo(() => {
    return expenses.reduce((sum, expense) => sum + expense.price, 0)
  }, [expenses])
  const totalGeneral = familyTotalQuery.data ?? 0
  const monthlyIncome = familyFinanceQuery.data?.monthly_income ?? 0
  const savingsGoal = familyFinanceQuery.data?.savings_goal ?? 0
  const usdExchangeRate =
    familyFinanceQuery.data?.usd_exchange_rate ?? DEFAULT_USD_EXCHANGE_RATE
  const fixedExpensesMonthlyTotal = useMemo(() => {
    return fixedExpenses.reduce((sum, fixedExpense) => sum + fixedExpense.amount, 0)
  }, [fixedExpenses])
  const spentInCurrentCycle = familyPeriodTotalQuery.data ?? 0
  const cycleBalanceBeforeSavings =
    monthlyIncome - savingsGoal - fixedExpensesMonthlyTotal - spentInCurrentCycle
  const savingsSpent = Math.min(savingsGoal, Math.max(0, -cycleBalanceBeforeSavings))
  const savingsRemaining = Math.max(0, savingsGoal - savingsSpent)
  const savingsSpentPercent =
    savingsGoal > 0 ? Math.round((savingsSpent / savingsGoal) * 100) : 0
  const totalAvailable = cycleBalanceBeforeSavings + savingsSpent
  const monthlyHistory = useMemo(() => {
    const rows = monthlyHistoryQuery.data ?? []

    return rows.map((row) => {
      const fixedSpent = fixedExpensesMonthlyTotal
      const spent = row.totalSpent + fixedSpent
      const goalSpent = Math.min(savingsGoal, Math.max(0, spent - (monthlyIncome - savingsGoal)))
      const saved = Math.max(0, monthlyIncome - spent)
      const endBalance = monthlyIncome - savingsGoal - spent + goalSpent
      const monthLabel = capitalizeText(monthYearFormatter.format(new Date(row.monthStartIso)))

      return {
        ...row,
        fixedSpent,
        spent,
        saved,
        goalSpent,
        endBalance,
        monthLabel,
      }
    })
  }, [fixedExpensesMonthlyTotal, monthlyHistoryQuery.data, monthlyIncome, savingsGoal])
  const monthlyHistoryTotals = useMemo(() => {
    return monthlyHistory.reduce(
      (accumulator, row) => {
        accumulator.totalSpent += row.spent
        accumulator.totalSaved += row.saved
        accumulator.totalGoalSpent += row.goalSpent
        return accumulator
      },
      {
        totalSpent: 0,
        totalSaved: 0,
        totalGoalSpent: 0,
      },
    )
  }, [monthlyHistory])
  const weeklyAvailable = payCycle.weeks > 0 ? totalAvailable / payCycle.weeks : totalAvailable
  const weeklyShare =
    totalAvailable > 0 && weeklyAvailable > 0
      ? weeklyAvailable / Math.max(totalAvailable, Number.EPSILON)
      : 0
  const profileInsight = useMemo(() => {
    const spectrum = [
      {
        tone: 'alert' as const,
        badge: 'Gastador',
        message: 'Ajuste total ahora.',
      },
      {
        tone: 'alert' as const,
        badge: 'Derrochador',
        message: 'Recortá gastos hoy.',
      },
      {
        tone: 'warning' as const,
        badge: 'Impulsivo',
        message: 'Controlá cada compra.',
      },
      {
        tone: 'warning' as const,
        badge: 'Variable',
        message: 'Evitá impulsos esta semana.',
      },
      {
        tone: 'steady' as const,
        badge: 'Equilibrado',
        message: 'Buen control, sostenelo.',
      },
      {
        tone: 'steady' as const,
        badge: 'Cauto',
        message: 'Vas más liviano.',
      },
      {
        tone: 'boost' as const,
        badge: 'Ordenado',
        message: 'Muy buen manejo.',
      },
      {
        tone: 'boost' as const,
        badge: 'Ahorrista',
        message: 'Excelente disciplina.',
      },
    ] as const

    const plannedAvailable = monthlyIncome - savingsGoal
    const availabilityRatio =
      plannedAvailable > 0 ? totalAvailable / plannedAvailable : totalAvailable > 0 ? 1 : 0
    const cadenceRatio =
      Number.isFinite(weeklyShare) && weeklyShare > 0 ? Math.min(1, weeklyShare / 0.3) : 0
    const blendedScore = availabilityRatio * 0.82 + cadenceRatio * 0.18
    const normalizedScore = Math.min(1, Math.max(0, (blendedScore + 0.25) / 1.2))
    const levelIndex = Math.min(7, Math.max(0, Math.round(normalizedScore * 7)))
    const selected = spectrum[levelIndex]

    return selected
  }, [monthlyIncome, savingsGoal, totalAvailable, weeklyShare])
  const dayDiffToPayDate = Math.round(
    (payCycle.end.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24),
  )
  const daysUntilNextPay = isSalaryPendingConfirmation
    ? Math.max(0, -dayDiffToPayDate)
    : Math.max(0, dayDiffToPayDate)
  const payCycleProgress = isSalaryPendingConfirmation
    ? 1
    : Math.min(1, Math.max(0, 1 - daysUntilNextPay / Math.max(1, payCycle.days)))
  const payCountdownHue = isSalaryPendingConfirmation ? 4 : Math.round(6 + payCycleProgress * 126)
  const payCountdownTone = isSalaryPendingConfirmation
    ? 'hsl(4 72% 42%)'
    : `hsl(${payCountdownHue} 70% 42%)`
  const payCountdownSurface = isSalaryPendingConfirmation
    ? 'hsl(4 88% 94%)'
    : `hsl(${payCountdownHue} 84% 94%)`
  const payCountdownFillWidth = isSalaryPendingConfirmation
    ? '100%'
    : `${Math.max(8, Math.round(payCycleProgress * 100))}%`
  const payCountdownLabel = isSalaryPendingConfirmation
    ? 'Cobro pendiente'
    : 'Cuenta regresiva sueldo'
  const payCountdownDaysLabel = `${daysUntilNextPay} ${daysUntilNextPay === 1 ? 'día' : 'días'}${
    isSalaryPendingConfirmation ? ' de atraso' : ''
  }`

  const newPriceDisplay = formatPriceInputValue(newPrice, isNewPriceFocused)
  const editingPriceDisplay = formatPriceInputValue(editingPrice, isEditingPriceFocused)
  const financeEditorAmountDisplay = formatPriceInputValue(
    financeEditorAmount,
    isFinanceEditorAmountFocused,
    financeEditorCurrency,
  )
  const usdRateInputDisplay = formatPriceInputValue(usdRateInput, isUsdRateInputFocused)
  const cycleRangeLabel = `${shortDateFormatter.format(payCycle.start)} - ${shortDateFormatter.format(
    payCycle.end,
  )}`
  const nextPayDateLabel = shortDateFormatter.format(payCycle.end)
  const payCountdownMeta = isSalaryPendingConfirmation
    ? `Fecha de cobro: ${nextPayDateLabel} · Confirmalo en el menú.`
    : `Próximo cobro: ${nextPayDateLabel} · Ciclo: ${cycleRangeLabel}`
  const todayPromptKey = formatLocalDateKey(todayDate)
  const isSalaryConfirmationAlertOpen =
    isManualSalaryConfirmationOpen ||
    (isSalaryPendingConfirmation && dismissedSalaryPromptDate !== todayPromptKey)
  const payTimelineStyles = {
    '--pay-countdown-tone': payCountdownTone,
    '--pay-countdown-surface': payCountdownSurface,
  } as CSSProperties
  const appThemeStyles = {
    '--app-bg-start': hexToRgba(activeCategoryColor, 0.2),
    '--app-bg-mid': hexToRgba(activeCategoryColor, 0.1),
    '--app-bg-end': '#f6f7f8',
    '--app-toolbar-bg': hexToRgba(activeCategoryColor, 0.16),
    '--app-title-color': shiftHexColor(activeCategoryColor, -34),
  } as CSSProperties

  useEffect(() => {
    if (!selectedCategoryId) {
      return
    }

    const selectedTab = categoryTabRefs.current[selectedCategoryId]
    if (!selectedTab) {
      return
    }

    selectedTab.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [selectedCategoryId, categories.length])

  const showToast = (message: string) => {
    setToastMessage(message)
    setToastOpen(true)
  }

  const closeFamilyMenu = () => {
    setFamilyMenuEvent(undefined)
  }

  const closeExpenseMenu = () => {
    setExpenseMenuEvent(undefined)
    setExpenseMenuTarget(null)
  }

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      showToast(getErrorMessage(error, 'No se pudo cerrar sesión.'))
      return
    }

    history.replace('/login')
  }

  const handleCopyCode = async () => {
    if (!familyCode) {
      showToast('No se encontró un código de familia para copiar.')
      return
    }

    try {
      await navigator.clipboard.writeText(familyCode)
      showToast('Family Code copiado.')
    } catch {
      showToast(`No se pudo copiar automáticamente. Código: ${familyCode}`)
    }
  }

  const handleAddExpense = () => {
    if (!selectedCategoryId) {
      showToast('Primero seleccioná o creá una categoría.')
      return
    }

    const price = parsePrice(newPrice)
    if (!newDescription.trim() || !Number.isFinite(price) || price < 0) {
      showToast('Completá descripción y un precio válido (>= 0).')
      return
    }

    createExpenseMutation.mutate(
      {
        categoryId: selectedCategoryId,
        description: newDescription,
        price,
      },
      {
        onSuccess: () => {
          setNewDescription('')
          setNewPrice('')
          setNewPriceFocused(false)
          setAddExpenseModalOpen(false)
        },
        onError: (error: unknown) => {
          showToast(getErrorMessage(error, 'No se pudo crear el gasto.'))
        },
      },
    )
  }

  const openEditExpense = (expense: Expense) => {
    setEditingExpense(expense)
    setEditingDescription(expense.description)
    setEditingPrice(serializePrice(expense.price))
    setEditingPriceFocused(false)
  }

  const handleUpdateExpense = () => {
    if (!editingExpense) {
      return
    }

    const parsedPrice = parsePrice(editingPrice)
    if (!editingDescription.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      showToast('Completá descripción y precio válido para editar.')
      return
    }

    updateExpenseMutation.mutate(
      {
        expenseId: editingExpense.id,
        description: editingDescription,
        price: parsedPrice,
      },
      {
        onSuccess: () => {
          setEditingExpense(null)
        },
        onError: (error: unknown) => {
          showToast(getErrorMessage(error, 'No se pudo editar el gasto.'))
        },
      },
    )
  }

  const handleDeleteExpense = (expenseId: string) => {
    const shouldDelete = window.confirm('¿Querés borrar este gasto?')
    if (!shouldDelete) {
      return
    }

    deleteExpenseMutation.mutate(expenseId, {
      onError: (error: unknown) => {
        showToast(getErrorMessage(error, 'No se pudo borrar el gasto.'))
      },
    })
  }

  const handleDeleteCategory = (categoryId: string) => {
    const shouldDelete = window.confirm(
      '¿Querés borrar esta categoría? Si tiene gastos, no se podrá borrar.',
    )

    if (!shouldDelete) {
      return
    }

    deleteCategoryMutation.mutate(categoryId, {
      onSuccess: () => {
        showToast('Categoría borrada.')
      },
      onError: (error: unknown) => {
        showToast(getErrorMessage(error, 'No se pudo borrar la categoría.'))
      },
    })
  }

  const closeFinanceEditor = () => {
    setFinanceEditorMetric(null)
    setFinanceEditorCurrency('ARS')
    setFinanceEditorAmount('')
    setFinanceEditorAmountFocused(false)
  }

  const closeUsdRateModal = () => {
    setUsdRateModalOpen(false)
    setUsdRateInput('')
    setUsdRateInputFocused(false)
  }

  const openUsdRateModal = () => {
    setUsdRateInput(serializePrice(usdExchangeRate))
    setUsdRateInputFocused(false)
    setUsdRateModalOpen(true)
  }

  const closeSalaryDayModal = () => {
    setSalaryDayModalOpen(false)
    setSalaryDayInput('')
  }

  const openSalaryDayModal = () => {
    setSalaryDayInput(String(salaryPaymentDay))
    setSalaryDayModalOpen(true)
  }

  const openFinanceEditor = (metric: FinanceEditorMetric) => {
    const arsAmount = metric === 'income' ? monthlyIncome : savingsGoal

    setFinanceEditorMetric(metric)
    setFinanceEditorCurrency('ARS')
    setFinanceEditorAmount(serializePrice(arsAmount))
    setFinanceEditorAmountFocused(false)
  }

  const handleFinanceEditorCurrencySwitch = (nextCurrency: MoneyCurrency) => {
    if (nextCurrency === financeEditorCurrency) {
      return
    }

    const parsedCurrentValue = parsePrice(financeEditorAmount)
    if (financeEditorAmount && Number.isFinite(parsedCurrentValue) && parsedCurrentValue >= 0) {
      const converted = convertCurrencyAmount(
        parsedCurrentValue,
        financeEditorCurrency,
        nextCurrency,
        usdExchangeRate,
      )

      if (Number.isFinite(converted)) {
        setFinanceEditorAmount(serializePrice(converted))
      }
    }

    setFinanceEditorCurrency(nextCurrency)
  }

  const handleSaveFinanceEditor = () => {
    if (!financeEditorMetric) {
      return
    }

    const parsedInputAmount = parsePrice(financeEditorAmount)
    if (!Number.isFinite(parsedInputAmount) || parsedInputAmount < 0) {
      showToast('Ingresá un monto válido (>= 0).')
      return
    }

    const amountInArs = convertCurrencyAmount(
      parsedInputAmount,
      financeEditorCurrency,
      'ARS',
      usdExchangeRate,
    )

    if (!Number.isFinite(amountInArs) || amountInArs < 0) {
      showToast('No se pudo convertir el monto con la cotización actual.')
      return
    }

    const nextMonthlyIncome = financeEditorMetric === 'income' ? amountInArs : monthlyIncome
    const nextSavingsGoal = financeEditorMetric === 'savings' ? amountInArs : savingsGoal

    upsertFamilyFinanceMutation.mutate(
      {
        monthlyIncome: nextMonthlyIncome,
        savingsGoal: nextSavingsGoal,
        usdExchangeRate,
        salaryPaymentDay,
        lastSalaryConfirmedAt,
      },
      {
        onSuccess: () => {
          closeFinanceEditor()
          showToast(
            financeEditorMetric === 'income'
              ? 'Ingreso actualizado.'
              : 'Ahorro objetivo actualizado.',
          )
        },
        onError: (error: unknown) => {
          showToast(
            getErrorMessage(
              error,
              financeEditorMetric === 'income'
                ? 'No se pudo guardar el ingreso.'
                : 'No se pudo guardar el ahorro objetivo.',
            ),
          )
        },
      },
    )
  }

  const handleSaveUsdExchangeRate = () => {
    const parsedRate = parsePrice(usdRateInput)
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      showToast('Ingresá una cotización válida de dólar (> 0).')
      return
    }

    upsertFamilyFinanceMutation.mutate(
      {
        monthlyIncome,
        savingsGoal,
        usdExchangeRate: parsedRate,
        salaryPaymentDay,
        lastSalaryConfirmedAt,
      },
      {
        onSuccess: () => {
          closeUsdRateModal()
          showToast('Cotización de dólar actualizada.')
        },
        onError: (error: unknown) => {
          showToast(getErrorMessage(error, 'No se pudo guardar la cotización de dólar.'))
        },
      },
    )
  }

  const handleSaveSalaryDay = () => {
    const parsedSalaryDay = Number.parseInt(salaryDayInput.replace(/[^\d]/g, ''), 10)
    if (!Number.isInteger(parsedSalaryDay) || parsedSalaryDay < 1 || parsedSalaryDay > 31) {
      showToast('Ingresá un día de cobro válido (1 a 31).')
      return
    }

    upsertFamilyFinanceMutation.mutate(
      {
        monthlyIncome,
        savingsGoal,
        usdExchangeRate,
        salaryPaymentDay: parsedSalaryDay,
        lastSalaryConfirmedAt,
      },
      {
        onSuccess: () => {
          closeSalaryDayModal()
          showToast('Día de cobro actualizado.')
        },
        onError: (error: unknown) => {
          showToast(getErrorMessage(error, 'No se pudo guardar el día de cobro.'))
        },
      },
    )
  }

  const handleConfirmSalaryPayment = () => {
    upsertFamilyFinanceMutation.mutate(
      {
        monthlyIncome,
        savingsGoal,
        usdExchangeRate,
        salaryPaymentDay,
        lastSalaryConfirmedAt: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          setManualSalaryConfirmationOpen(false)
          setDismissedSalaryPromptDate(todayPromptKey)
          closeFamilyMenu()
          showToast('Cobro confirmado. El ciclo financiero fue actualizado.')
        },
        onError: (error: unknown) => {
          showToast(getErrorMessage(error, 'No se pudo confirmar el cobro.'))
        },
      },
    )
  }

  const openSalaryConfirmationPrompt = () => {
    closeFamilyMenu()

    if (!isSalaryPendingConfirmation) {
      showToast('El cobro de este ciclo ya está confirmado.')
      return
    }

    setManualSalaryConfirmationOpen(true)
  }

  const handleResetMonthlyHistory = () => {
    const shouldClear = window.confirm(
      'Se van a borrar todos los gastos cargados de la familia. Esta acción no se puede deshacer. ¿Continuar?',
    )

    if (!shouldClear) {
      return
    }

    clearFamilyExpensesMutation.mutate(undefined, {
      onSuccess: () => {
        setMonthlyHistoryModalOpen(false)
        showToast('Data reiniciada. El cálculo vuelve a empezar desde este mes.')
      },
      onError: (error: unknown) => {
        showToast(getErrorMessage(error, 'No se pudo limpiar la data de gastos.'))
      },
    })
  }

  if (!familyId) {
    return null
  }

  const isBusy =
    createExpenseMutation.isPending ||
    updateExpenseMutation.isPending ||
    deleteExpenseMutation.isPending ||
    clearFamilyExpensesMutation.isPending ||
    createCategoryMutation.isPending ||
    renameCategoryMutation.isPending ||
    deleteCategoryMutation.isPending ||
    updateDisplayNameMutation.isPending ||
    upsertFamilyFinanceMutation.isPending ||
    enablePushMutation.isPending

  return (
    <IonPage style={appThemeStyles}>
      <IonHeader translucent>
        <IonToolbar className="app-main-toolbar">
          <IonTitle className="app-main-title">Gastos Familia</IonTitle>
          <IonButtons slot="end">
            <IonButton
              aria-label="Abrir menú de familia"
              onClick={(event) => setFamilyMenuEvent(event.nativeEvent)}
            >
              <IonIcon icon={menuOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>

        <IonToolbar className="family-toolbar">
          <div className={`family-header-card family-header-card--${profileInsight.tone}`}>
            <div className="family-header-top-row">
              <p className="family-header-user family-header-user--solo">{displayName}</p>
              <span className="family-header-badge">{profileInsight.badge}</span>
            </div>
            <p className="family-header-message">{profileInsight.message}</p>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent className="app-content" fullscreen>
        <div className="app-shell">
          <div className="overview-liquid-shell">
            <div
              className={`overview-liquid-card${
                familyTotalQuery.isLoading ||
                familyFinanceQuery.isLoading ||
                familyPeriodTotalQuery.isLoading ||
                fixedExpensesQuery.isLoading
                  ? ' is-loading'
                  : ''
              }`}
            >
              <div className="pay-countdown-shell" style={payTimelineStyles}>
                <div className="pay-countdown-top">
                  <p className="pay-countdown-label">{payCountdownLabel}</p>
                  <p className="pay-countdown-days">{payCountdownDaysLabel}</p>
                </div>

                <div className="pay-countdown-track" role="presentation">
                  <span className="pay-countdown-fill" style={{ width: payCountdownFillWidth }} />
                </div>

                <p className="pay-countdown-meta">{payCountdownMeta}</p>
              </div>

              <p className="overview-liquid-kicker">Total general</p>
              <p className="overview-liquid-value">
                {currencyFormatter.format(totalGeneral)}
              </p>
              <p className="price-usd-hint overview-liquid-usd">
                {formatUsdFromArs(totalGeneral, usdExchangeRate)}
              </p>

              <div className="overview-metrics-grid">
                <div className="overview-metrics-inline-row">
                  <button
                    className="overview-metric-button overview-metric-button--income is-compact"
                    disabled={upsertFamilyFinanceMutation.isPending}
                    onClick={() => openFinanceEditor('income')}
                    type="button"
                  >
                    <span className="overview-metric-heading">
                      <IonIcon className="overview-metric-icon" icon={trendingUpOutline} />
                      <span className="overview-metric-label">Total ingreso</span>
                    </span>
                    <span className="overview-metric-values">
                      <span className="overview-metric-value">
                        {currencyFormatter.format(monthlyIncome)}
                      </span>
                      <span className="price-usd-hint">
                        {formatUsdFromArs(monthlyIncome, usdExchangeRate)}
                      </span>
                    </span>
                  </button>

                  <button
                    className="overview-metric-button overview-metric-button--savings is-compact"
                    disabled={upsertFamilyFinanceMutation.isPending}
                    onClick={() => openFinanceEditor('savings')}
                    type="button"
                  >
                    <span className="overview-metric-heading">
                      <IonIcon className="overview-metric-icon" icon={shieldCheckmarkOutline} />
                      <span className="overview-metric-label">Ahorro objetivo</span>
                    </span>
                    <span className="overview-metric-values">
                      <span className="overview-metric-value">
                        {currencyFormatter.format(savingsGoal)}
                      </span>
                      <span className="price-usd-hint">
                        {formatUsdFromArs(savingsGoal, usdExchangeRate)}
                      </span>
                    </span>
                  </button>
                </div>

                {savingsSpent > 0 && (
                  <div className="overview-metric-panel overview-metric-panel--savings-spent is-negative">
                    <span className="overview-metric-heading">
                      <IonIcon className="overview-metric-icon" icon={removeCircle} />
                      <span className="overview-metric-label">Ahorro gastado</span>
                    </span>
                    <span className="overview-metric-value">
                      {currencyFormatter.format(savingsSpent)}
                    </span>
                    <span className="overview-metric-footnote">
                      {savingsSpentPercent}% del objetivo · Resta{' '}
                      {currencyFormatter.format(savingsRemaining)}
                    </span>
                    <span className="price-usd-hint overview-metric-usd">
                      {formatUsdFromArs(savingsSpent, usdExchangeRate)}
                    </span>
                  </div>
                )}

                <div className="overview-metric-panel overview-metric-panel--available">
                  <span className="overview-metric-heading">
                    <IonIcon className="overview-metric-icon" icon={walletOutline} />
                    <span className="overview-metric-label">Total disponible</span>
                  </span>
                  <span className="overview-metric-value">
                    {currencyFormatter.format(totalAvailable)}
                  </span>
                  <span className="overview-metric-footnote">
                    Ciclo {cycleRangeLabel} ({payCycle.weeks} sem) · Fijos:{' '}
                    {currencyFormatter.format(fixedExpensesMonthlyTotal)}
                  </span>
                  <span className="price-usd-hint overview-metric-usd">
                    {formatUsdFromArs(totalAvailable, usdExchangeRate)}
                  </span>
                </div>

                <div className="overview-metric-panel overview-metric-panel--weekly">
                  <span className="overview-metric-heading">
                    <IonIcon className="overview-metric-icon" icon={calendarOutline} />
                    <span className="overview-metric-label">Disponible semanal</span>
                  </span>
                  <span className="overview-metric-value">
                    {currencyFormatter.format(weeklyAvailable)}
                  </span>
                  <span className="overview-metric-footnote">
                    Gasto ciclo: {currencyFormatter.format(spentInCurrentCycle)} + fijos
                  </span>
                  <span className="price-usd-hint overview-metric-usd">
                    {formatUsdFromArs(weeklyAvailable, usdExchangeRate)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="category-liquid-shell">
            <div className="category-liquid-card">
              <div className="category-liquid-top">
                <p className="category-liquid-kicker">Categoría activa</p>

                <IonButton
                  className="category-liquid-manage"
                  fill="clear"
                  onClick={() => setCategoriesModalOpen(true)}
                >
                  <IonIcon icon={createOutline} slot="start" />
                  Gestionar
                </IonButton>
              </div>

              {categories.length > 0 ? (
                <div className="category-tabs-wrap">
                  <div
                    aria-label="Selector de categorías"
                    className="category-tabs-scroll"
                    role="tablist"
                  >
                    {categories.map((category) => {
                      const isActive = category.id === selectedCategoryId

                      return (
                        <button
                          aria-selected={isActive}
                          className={`category-tab${isActive ? ' is-active' : ''}`}
                          key={category.id}
                          ref={(tabNode) => {
                            categoryTabRefs.current[category.id] = tabNode
                          }}
                          onClick={() => setCategorySelection(category.id)}
                          role="tab"
                          style={buildCategoryTabStyle(category.color)}
                          type="button"
                        >
                          {category.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="category-empty">No hay categorías todavía.</p>
              )}

              <div className={`category-totals-grid${expensesQuery.isLoading ? ' is-loading' : ''}`}>
                <div className="category-total-chip">
                  <div className="category-total-main">
                    <div className="category-total-texts">
                      <p className="category-total-label">Total categoría</p>
                      <p className="category-total-value">
                        {currencyFormatter.format(totalForCategory)}
                      </p>
                      <p className="price-usd-hint category-total-usd">
                        {formatUsdFromArs(totalForCategory, usdExchangeRate)}
                      </p>
                    </div>

                    <button
                      aria-label="Agregar gasto"
                      className="category-total-action"
                      onClick={() => setAddExpenseModalOpen(true)}
                      type="button"
                    >
                      <span aria-hidden="true" className="category-total-action-icon">
                        <IonIcon className="category-total-action-cash" icon={cashOutline} />
                        <IonIcon className="category-total-action-minus" icon={removeCircle} />
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="expenses-liquid-shell">
            <div className="expenses-liquid-card">
              <div className="expenses-liquid-top">
                <p className="expenses-liquid-kicker">Gastos</p>
                <span className="expenses-count-chip">{expenses.length}</span>
              </div>

              {categoriesQuery.isLoading || expensesQuery.isLoading ? (
                <div className="loading-row">
                  <IonSpinner name="crescent" />
                </div>
              ) : null}

              {!categoriesQuery.isLoading && categories.length === 0 && (
                <IonText color="medium">
                  <p className="empty-message">
                    No hay categorías todavía. Creá una desde el botón de gestión.
                  </p>
                </IonText>
              )}

              {!expensesQuery.isLoading && categories.length > 0 && expenses.length === 0 && (
                <IonText color="medium">
                  <p className="empty-message">No hay gastos en esta categoría por ahora.</p>
                </IonText>
              )}

              <div className="expenses-pills-list">
                {expenses.map((expense) => (
                  <article className="expense-pill-item" key={expense.id}>
                    <div className="expense-pill-main">
                      <div className="expense-pill-texts">
                        <p className="expense-pill-description">{expense.description}</p>
                        <span className="expense-pill-author">{expense.creator_display_name}</span>
                      </div>
                      <div className="expense-pill-price-stack">
                        <div className="expense-pill-price-row">
                          <p className="expense-pill-price">
                            {currencyFormatter.format(expense.price)}
                          </p>

                          <button
                            aria-label="Abrir acciones del gasto"
                            className="expense-kebab-button"
                            onClick={(event) => {
                              setExpenseMenuTarget(expense)
                              setExpenseMenuEvent(event.nativeEvent)
                            }}
                            type="button"
                          >
                            <IonIcon icon={ellipsisVerticalOutline} />
                          </button>
                        </div>

                        <p className="price-usd-hint expense-pill-usd">
                          {formatUsdFromArs(expense.price, usdExchangeRate)}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </IonContent>

      <IonPopover
        event={familyMenuEvent}
        isOpen={Boolean(familyMenuEvent)}
        onDidDismiss={closeFamilyMenu}
      >
        <div className="family-menu-popover">
          <div className="family-menu-top">
            <p className="family-menu-title">Familia compartida</p>
            <p className="family-menu-user">{displayName}</p>
            <div className="family-menu-code-row">
              <span>Family Code</span>
              <span className="code-pill">{familyCode}</span>
            </div>
            <div className="family-menu-code-row">
              <span>Dólar</span>
              <span className="code-pill">{currencyFormatter.format(usdExchangeRate)}</span>
            </div>
          </div>

          <IonList className="family-menu-list" lines="none">
            <IonItem
              button
              detail={false}
              onClick={() => {
                closeFamilyMenu()
                void handleCopyCode()
              }}
            >
              <IonIcon icon={copyOutline} slot="start" />
              <IonLabel>Copiar código</IonLabel>
            </IonItem>

            <IonItem
              button
              detail={false}
              onClick={() => {
                closeFamilyMenu()
                setDisplayNameAlertOpen(true)
              }}
            >
              <IonIcon icon={pencilOutline} slot="start" />
              <IonLabel>Cambiar nombre</IonLabel>
            </IonItem>

            <IonItem
              button
              detail={false}
              onClick={() => {
                closeFamilyMenu()
                openUsdRateModal()
              }}
            >
              <IonIcon icon={cashOutline} slot="start" />
              <IonLabel>Cotización dólar</IonLabel>
            </IonItem>

            <IonItem
              button
              detail={false}
              onClick={() => {
                closeFamilyMenu()
                openSalaryDayModal()
              }}
            >
              <IonIcon icon={calendarOutline} slot="start" />
              <IonLabel>Día de cobro</IonLabel>
            </IonItem>

            <IonItem
              button
              detail={false}
              onClick={() => {
                closeFamilyMenu()
                history.push('/app/fixed-expenses')
              }}
            >
              <IonIcon icon={walletOutline} slot="start" />
              <IonLabel>Gastos fijos</IonLabel>
            </IonItem>

            <IonItem
              button
              detail={false}
              onClick={() => {
                closeFamilyMenu()
                setNotificationsModalOpen(true)
              }}
            >
              <IonIcon icon={notificationsOutline} slot="start" />
              <IonLabel>Notificaciones</IonLabel>
            </IonItem>

            <IonItem
              button
              detail={false}
              disabled={enablePushMutation.isPending}
              onClick={() => {
                closeFamilyMenu()

                if (!familyId || !userId) {
                  showToast('No hay sesión activa para habilitar push.')
                  return
                }

                enablePushMutation.mutate(
                  {
                    familyId,
                    userId,
                  },
                  {
                    onSuccess: () => {
                      void hasPushSubscriptionQuery.refetch()
                      showToast('Notificaciones push activadas.')
                    },
                    onError: (error: unknown) => {
                      showToast(getErrorMessage(error, 'No se pudo activar push.'))
                    },
                  },
                )
              }}
            >
              <IonIcon icon={notificationsOutline} slot="start" />
              <IonLabel>
                {hasPushSubscriptionQuery.data ? 'Push activado' : 'Activar push'}
              </IonLabel>
            </IonItem>

            {isSalaryPendingConfirmation ? (
              <IonItem button detail={false} onClick={openSalaryConfirmationPrompt}>
                <IonIcon icon={cashOutline} slot="start" />
                <IonLabel>Confirmar cobro</IonLabel>
              </IonItem>
            ) : null}

            <IonItem
              button
              detail={false}
              onClick={() => {
                closeFamilyMenu()
                setMonthlyHistoryModalOpen(true)
              }}
            >
              <IonIcon icon={statsChartOutline} slot="start" />
              <IonLabel>Resultados mensuales</IonLabel>
            </IonItem>

            <IonItem
              button
              detail={false}
              onClick={() => {
                closeFamilyMenu()
                void handleLogout()
              }}
            >
              <IonIcon color="danger" icon={logOutOutline} slot="start" />
              <IonLabel color="danger">Salir</IonLabel>
            </IonItem>
          </IonList>
        </div>
      </IonPopover>

      <IonPopover
        className="expense-actions-popover"
        event={expenseMenuEvent}
        isOpen={Boolean(expenseMenuEvent)}
        onDidDismiss={closeExpenseMenu}
      >
        <div className="expense-menu-popover">
          <div className="expense-menu-actions">
            <button
              aria-label="Editar gasto"
              className="expense-menu-icon-button"
              onClick={() => {
                if (!expenseMenuTarget) {
                  closeExpenseMenu()
                  return
                }

                const target = expenseMenuTarget
                closeExpenseMenu()
                openEditExpense(target)
              }}
              type="button"
            >
              <IonIcon icon={pencilOutline} />
            </button>

            <button
              aria-label="Borrar gasto"
              className="expense-menu-icon-button is-danger"
              onClick={() => {
                if (!expenseMenuTarget) {
                  closeExpenseMenu()
                  return
                }

                const targetId = expenseMenuTarget.id
                closeExpenseMenu()
                handleDeleteExpense(targetId)
              }}
              type="button"
            >
              <IonIcon icon={trashOutline} />
            </button>
          </div>
        </div>
      </IonPopover>

      <IonModal
        className="content-fit-modal"
        isOpen={isAddExpenseModalOpen}
        onDidDismiss={() => setAddExpenseModalOpen(false)}
      >
        <div className="content-fit-modal-shell">
          <div className="content-fit-modal-header">
            <p className="content-fit-modal-title">Nuevo gasto</p>
            <IonButton fill="clear" onClick={() => setAddExpenseModalOpen(false)}>
              Cerrar
            </IonButton>
          </div>

          <div className="expense-liquid-card">
            <div className="expense-field-group">
              <label className="expense-field-label" htmlFor="expense-description-modal-input">
                Descripción
              </label>
              <IonInput
                id="expense-description-modal-input"
                className="expense-liquid-input"
                placeholder="Ej: Hamburguesa"
                type="text"
                value={newDescription}
                onIonInput={(event) => setNewDescription(event.detail.value ?? '')}
              />
            </div>

            <div className="expense-field-group">
              <label className="expense-field-label" htmlFor="expense-price-modal-input">
                Precio
              </label>
              <IonInput
                id="expense-price-modal-input"
                className="expense-liquid-input expense-liquid-price"
                inputmode="decimal"
                placeholder="$ 0"
                type="text"
                value={newPriceDisplay}
                onIonInput={(event) =>
                  setNewPrice(normalizePriceInput(event.detail.value ?? ''))
                }
                onIonFocus={() => setNewPriceFocused(true)}
                onIonBlur={() => setNewPriceFocused(false)}
              />
            </div>

            <IonButton
              className="expense-liquid-submit"
              disabled={isBusy}
              expand="block"
              onClick={handleAddExpense}
            >
              <IonIcon icon={addOutline} slot="start" />
              Agregar gasto
            </IonButton>
          </div>
        </div>
      </IonModal>

      <IonModal
        className="content-fit-modal"
        isOpen={isCategoriesModalOpen}
        onDidDismiss={() => setCategoriesModalOpen(false)}
      >
        <div className="content-fit-modal-shell">
          <div className="content-fit-modal-header">
            <p className="content-fit-modal-title">Categorías</p>
            <IonButton fill="clear" onClick={() => setCategoriesModalOpen(false)}>
              Cerrar
            </IonButton>
          </div>

          <div className="expense-liquid-card">
            <IonButton expand="block" onClick={() => setNewCategoryAlertOpen(true)}>
              <IonIcon icon={addOutline} slot="start" />
              Nueva categoría
            </IonButton>

            <IonList className="categories-modal-list" lines="full">
              {categories.map((category) => (
                <IonItem key={category.id}>
                  <IonLabel>{category.name}</IonLabel>

                  <IonButton
                    fill="clear"
                    slot="end"
                    onClick={() => setRenameTargetCategory(category)}
                  >
                    <IonIcon icon={pencilOutline} slot="icon-only" />
                  </IonButton>

                  <IonButton
                    color="danger"
                    fill="clear"
                    slot="end"
                    onClick={() => handleDeleteCategory(category.id)}
                  >
                    <IonIcon icon={trashOutline} slot="icon-only" />
                  </IonButton>
                </IonItem>
              ))}
            </IonList>
          </div>
        </div>
      </IonModal>

      <IonModal
        className="content-fit-modal"
        isOpen={Boolean(editingExpense)}
        onDidDismiss={() => setEditingExpense(null)}
      >
        <div className="content-fit-modal-shell">
          <div className="content-fit-modal-header">
            <p className="content-fit-modal-title">Editar gasto</p>
            <IonButton fill="clear" onClick={() => setEditingExpense(null)}>
              Cerrar
            </IonButton>
          </div>

          <div className="expense-liquid-card">
            <div className="expense-field-group">
              <label className="expense-field-label" htmlFor="expense-edit-description-input">
                Descripción
              </label>
              <IonInput
                id="expense-edit-description-input"
                className="expense-liquid-input"
                type="text"
                value={editingDescription}
                onIonInput={(event) => setEditingDescription(event.detail.value ?? '')}
              />
            </div>

            <div className="expense-field-group">
              <label className="expense-field-label" htmlFor="expense-edit-price-input">
                Precio
              </label>
              <IonInput
                id="expense-edit-price-input"
                className="expense-liquid-input expense-liquid-price"
                inputmode="decimal"
                type="text"
                value={editingPriceDisplay}
                onIonInput={(event) =>
                  setEditingPrice(normalizePriceInput(event.detail.value ?? ''))
                }
                onIonFocus={() => setEditingPriceFocused(true)}
                onIonBlur={() => setEditingPriceFocused(false)}
              />
            </div>

            <IonButton
              className="expense-liquid-submit"
              disabled={isBusy}
              expand="block"
              onClick={handleUpdateExpense}
            >
              Guardar cambios
            </IonButton>
          </div>
        </div>
      </IonModal>

      <IonAlert
        isOpen={isNewCategoryAlertOpen}
        onDidDismiss={() => setNewCategoryAlertOpen(false)}
        header="Nueva categoría"
        inputs={[
          {
            name: 'name',
            type: 'text',
            placeholder: 'Ej: Transporte',
          },
        ]}
        buttons={[
          {
            text: 'Cancelar',
            role: 'cancel',
          },
          {
            text: 'Crear',
            handler: (values: { name?: string }) => {
              const rawName = values.name ?? ''
              createCategoryMutation.mutate(rawName, {
                onSuccess: () => {
                  showToast('Categoría creada.')
                },
                onError: (error: unknown) => {
                  showToast(getErrorMessage(error, 'No se pudo crear la categoría.'))
                },
              })
            },
          },
        ]}
      />

      <IonAlert
        isOpen={Boolean(renameTargetCategory)}
        onDidDismiss={() => setRenameTargetCategory(null)}
        header="Renombrar categoría"
        inputs={[
          {
            name: 'name',
            type: 'text',
            value: renameTargetCategory?.name ?? '',
          },
        ]}
        buttons={[
          {
            text: 'Cancelar',
            role: 'cancel',
          },
          {
            text: 'Guardar',
            handler: (values: { name?: string }) => {
              if (!renameTargetCategory) {
                return
              }

              const rawName = values.name ?? ''
              renameCategoryMutation.mutate(
                {
                  categoryId: renameTargetCategory.id,
                  name: rawName,
                },
                {
                  onSuccess: () => {
                    showToast('Categoría renombrada.')
                  },
                  onError: (error: unknown) => {
                    showToast(getErrorMessage(error, 'No se pudo renombrar la categoría.'))
                  },
                },
              )
            },
          },
        ]}
      />

      <IonAlert
        isOpen={isDisplayNameAlertOpen}
        onDidDismiss={() => setDisplayNameAlertOpen(false)}
        header="Cambiar display name"
        inputs={[
          {
            name: 'display_name',
            type: 'text',
            value: displayName,
          },
        ]}
        buttons={[
          {
            text: 'Cancelar',
            role: 'cancel',
          },
          {
            text: 'Guardar',
            handler: (values: { display_name?: string }) => {
              updateDisplayNameMutation.mutate(values.display_name ?? '', {
                onSuccess: () => {
                  showToast('Display name actualizado.')
                },
                onError: (error: unknown) => {
                  showToast(getErrorMessage(error, 'No se pudo actualizar el display name.'))
                },
              })
            },
          },
        ]}
      />

      <IonAlert
        isOpen={isSalaryConfirmationAlertOpen}
        onDidDismiss={() => {
          setManualSalaryConfirmationOpen(false)
          if (isSalaryPendingConfirmation) {
            setDismissedSalaryPromptDate(todayPromptKey)
          }
        }}
        backdropDismiss={!isBusy}
        header="Cobraste?"
        message="Si confirmás, el ciclo financiero avanza al nuevo cobro. Si todavía no, te lo vamos a volver a recordar."
        buttons={[
          {
            text: 'Todavía no',
            role: 'cancel',
          },
          {
            text: 'Sí, confirmar',
            handler: () => {
              handleConfirmSalaryPayment()
              return false
            },
          },
        ]}
      />

      <IonModal
        className="content-fit-modal"
        isOpen={Boolean(financeEditorMetric)}
        onDidDismiss={closeFinanceEditor}
      >
        <div className="content-fit-modal-shell">
          <div className="content-fit-modal-header">
            <p className="content-fit-modal-title">
              {financeEditorMetric === 'income' ? 'Total ingreso' : 'Ahorro objetivo'}
            </p>
            <IonButton fill="clear" onClick={closeFinanceEditor}>
              Cerrar
            </IonButton>
          </div>

          <div className="expense-liquid-card">
            <div className="finance-currency-switch" role="group" aria-label="Moneda">
              <button
                className={`finance-currency-option${
                  financeEditorCurrency === 'ARS' ? ' is-active' : ''
                }`}
                onClick={() => handleFinanceEditorCurrencySwitch('ARS')}
                type="button"
              >
                ARS
              </button>

              <button
                className={`finance-currency-option${
                  financeEditorCurrency === 'USD' ? ' is-active' : ''
                }`}
                onClick={() => handleFinanceEditorCurrencySwitch('USD')}
                type="button"
              >
                USD
              </button>
            </div>

            <div className="expense-field-group">
              <label className="expense-field-label" htmlFor="finance-editor-amount-input">
                Monto ({financeEditorCurrency})
              </label>
              <IonInput
                id="finance-editor-amount-input"
                className="expense-liquid-input expense-liquid-price"
                inputmode="decimal"
                type="text"
                value={financeEditorAmountDisplay}
                onIonInput={(event) =>
                  setFinanceEditorAmount(normalizePriceInput(event.detail.value ?? ''))
                }
                onIonFocus={() => setFinanceEditorAmountFocused(true)}
                onIonBlur={() => setFinanceEditorAmountFocused(false)}
              />
            </div>

            <p className="finance-currency-hint">
              Cotización actual: {currencyFormatter.format(usdExchangeRate)} por USD.
            </p>

            <IonButton
              className="expense-liquid-submit"
              disabled={isBusy}
              expand="block"
              onClick={handleSaveFinanceEditor}
            >
              Guardar
            </IonButton>
          </div>
        </div>
      </IonModal>

      <IonModal
        className="content-fit-modal"
        isOpen={isUsdRateModalOpen}
        onDidDismiss={closeUsdRateModal}
      >
        <div className="content-fit-modal-shell">
          <div className="content-fit-modal-header">
            <p className="content-fit-modal-title">Cotización dólar (ARS)</p>
            <IonButton fill="clear" onClick={closeUsdRateModal}>
              Cerrar
            </IonButton>
          </div>

          <div className="expense-liquid-card">
            <div className="expense-field-group">
              <label className="expense-field-label" htmlFor="usd-rate-input">
                Monto por USD
              </label>
              <IonInput
                id="usd-rate-input"
                className="expense-liquid-input expense-liquid-price"
                inputmode="decimal"
                placeholder="$ 0"
                type="text"
                value={usdRateInputDisplay}
                onIonInput={(event) =>
                  setUsdRateInput(normalizePriceInput(event.detail.value ?? ''))
                }
                onIonFocus={() => setUsdRateInputFocused(true)}
                onIonBlur={() => setUsdRateInputFocused(false)}
              />
            </div>

            <IonButton
              className="expense-liquid-submit"
              disabled={isBusy}
              expand="block"
              onClick={handleSaveUsdExchangeRate}
            >
              Guardar cotización
            </IonButton>
          </div>
        </div>
      </IonModal>

      <IonModal
        className="content-fit-modal"
        isOpen={isSalaryDayModalOpen}
        onDidDismiss={closeSalaryDayModal}
      >
        <div className="content-fit-modal-shell">
          <div className="content-fit-modal-header">
            <p className="content-fit-modal-title">Día de cobro del sueldo</p>
            <IonButton fill="clear" onClick={closeSalaryDayModal}>
              Cerrar
            </IonButton>
          </div>

          <div className="expense-liquid-card">
            <div className="expense-field-group">
              <label className="expense-field-label" htmlFor="salary-day-input">
                Día del mes (1-31)
              </label>
              <IonInput
                id="salary-day-input"
                className="expense-liquid-input"
                inputmode="numeric"
                maxlength={2}
                placeholder="Ej: 20"
                type="text"
                value={salaryDayInput}
                onIonInput={(event) =>
                  setSalaryDayInput((event.detail.value ?? '').replace(/[^\d]/g, '').slice(0, 2))
                }
              />
            </div>

            <p className="finance-currency-hint">
              Si cae sábado o domingo, se pasa automáticamente al próximo día hábil.
            </p>

            <IonButton
              className="expense-liquid-submit"
              disabled={isBusy}
              expand="block"
              onClick={handleSaveSalaryDay}
            >
              Guardar día de cobro
            </IonButton>
          </div>
        </div>
      </IonModal>

      <IonModal
        className="content-fit-modal"
        isOpen={isNotificationsModalOpen}
        onDidDismiss={() => setNotificationsModalOpen(false)}
      >
        <div className="content-fit-modal-shell">
          <div className="content-fit-modal-header">
            <p className="content-fit-modal-title">Notificaciones</p>
            <IonButton fill="clear" onClick={() => setNotificationsModalOpen(false)}>
              Cerrar
            </IonButton>
          </div>

          <div className="monthly-history-shell">
            <p className="monthly-history-note">
              Eventos recientes de gastos y gastos fijos de la familia.
            </p>

            {notificationsQuery.isLoading ? (
              <div className="loading-row">
                <IonSpinner name="crescent" />
              </div>
            ) : null}

            {!notificationsQuery.isLoading && notificationsQuery.error ? (
              <p className="monthly-history-empty">No se pudieron cargar las notificaciones.</p>
            ) : null}

            {!notificationsQuery.isLoading &&
            !notificationsQuery.error &&
            notifications.length === 0 ? (
              <p className="monthly-history-empty">Todavía no hay notificaciones.</p>
            ) : null}

            {!notificationsQuery.isLoading &&
            !notificationsQuery.error &&
            notifications.length > 0 ? (
              <div className="monthly-history-list">
                {notifications.map((notification) => (
                  <article className="monthly-history-card" key={notification.id}>
                    <div className="monthly-history-card-top">
                      <p className="monthly-history-month">{notification.title}</p>
                      <span className="monthly-history-balance-chip is-positive">
                        {notificationKindLabel(notification.kind)}
                      </span>
                    </div>

                    {notification.body.trim() !== '' ? (
                      <p className="monthly-history-note">{notification.body}</p>
                    ) : null}

                    <p className="monthly-history-label">
                      {formatNotificationDate(notification.created_at)}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </IonModal>

      <IonModal
        className="content-fit-modal"
        isOpen={isMonthlyHistoryModalOpen}
        onDidDismiss={() => setMonthlyHistoryModalOpen(false)}
      >
        <div className="content-fit-modal-shell">
          <div className="content-fit-modal-header">
            <p className="content-fit-modal-title">Resultados mensuales</p>
            <IonButton fill="clear" onClick={() => setMonthlyHistoryModalOpen(false)}>
              Cerrar
            </IonButton>
          </div>

          <div className="monthly-history-shell">
            <p className="monthly-history-note">
              Últimos 6 meses (incluye mes vigente). El cálculo usa ingreso y objetivo actuales e
              incluye gastos fijos mensuales.
            </p>

            <div className="monthly-history-summary-grid">
              <div className="monthly-history-summary-card">
                <span className="monthly-history-summary-label">Ahorro acumulado</span>
                <strong className="monthly-history-summary-value is-saved">
                  {currencyFormatter.format(monthlyHistoryTotals.totalSaved)}
                </strong>
              </div>

              <div className="monthly-history-summary-card">
                <span className="monthly-history-summary-label">Gasto acumulado</span>
                <strong className="monthly-history-summary-value is-spent">
                  {currencyFormatter.format(monthlyHistoryTotals.totalSpent)}
                </strong>
              </div>
            </div>

            {monthlyHistoryQuery.isLoading ? (
              <div className="loading-row">
                <IonSpinner name="crescent" />
              </div>
            ) : null}

            {!monthlyHistoryQuery.isLoading && monthlyHistoryQuery.error ? (
              <p className="monthly-history-empty">No se pudo cargar el historial mensual.</p>
            ) : null}

            {!monthlyHistoryQuery.isLoading &&
            !monthlyHistoryQuery.error &&
            monthlyHistory.length === 0 ? (
              <p className="monthly-history-empty">Todavía no hay movimientos en meses anteriores.</p>
            ) : null}

            {!monthlyHistoryQuery.isLoading &&
            !monthlyHistoryQuery.error &&
            monthlyHistory.length > 0 ? (
              <div className="monthly-history-list">
                {monthlyHistory.map((row) => (
                  <article className="monthly-history-card" key={row.monthStartIso}>
                    <div className="monthly-history-card-top">
                      <p className="monthly-history-month">{row.monthLabel}</p>
                      <span
                        className={`monthly-history-balance-chip${
                          row.endBalance < 0 ? ' is-negative' : ' is-positive'
                        }`}
                      >
                        {row.endBalance < 0 ? 'Cierre en rojo' : 'Cierre positivo'}
                      </span>
                    </div>

                    <div className="monthly-history-grid">
                      <div className="monthly-history-metric">
                        <span className="monthly-history-label">Total gastado</span>
                        <strong className="monthly-history-value is-spent">
                          {currencyFormatter.format(row.spent)}
                        </strong>
                      </div>

                      <div className="monthly-history-metric">
                        <span className="monthly-history-label">Total ahorrado</span>
                        <strong className="monthly-history-value is-saved">
                          {currencyFormatter.format(row.saved)}
                        </strong>
                      </div>

                      <div className="monthly-history-metric">
                        <span className="monthly-history-label">Gasto fijo mensual</span>
                        <strong className="monthly-history-value is-spent-soft">
                          {currencyFormatter.format(row.fixedSpent)}
                        </strong>
                      </div>

                      <div className="monthly-history-metric">
                        <span className="monthly-history-label">Ahorro objetivo gastado</span>
                        <strong className="monthly-history-value is-spent-soft">
                          {currencyFormatter.format(row.goalSpent)}
                        </strong>
                      </div>

                      <div className="monthly-history-metric">
                        <span className="monthly-history-label">Balance final</span>
                        <strong
                          className={`monthly-history-value${
                            row.endBalance < 0 ? ' is-negative' : ' is-positive'
                          }`}
                        >
                          {currencyFormatter.format(row.endBalance)}
                        </strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            <IonButton
              className="monthly-history-reset-button"
              color="danger"
              disabled={isBusy}
              expand="block"
              fill="outline"
              onClick={handleResetMonthlyHistory}
            >
              Limpiar data y reiniciar desde mes vigente
            </IonButton>
          </div>
        </div>
      </IonModal>

      <IonToast
        isOpen={isToastOpen}
        message={toastMessage}
        duration={2200}
        onDidDismiss={() => setToastOpen(false)}
      />
    </IonPage>
  )
}
