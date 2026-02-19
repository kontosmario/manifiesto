import { useEffect, useMemo, useRef, useState } from 'react'
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
  cashOutline,
  copyOutline,
  ellipsisVerticalOutline,
  createOutline,
  logOutOutline,
  menuOutline,
  peopleCircleOutline,
  pencilOutline,
  removeCircle,
  trashOutline,
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
  useCreateExpense,
  useDeleteExpense,
  useExpenses,
  useFamilyTotal,
  useUpdateExpense,
  type Expense,
} from '../hooks/useExpenses'
import {
  DEFAULT_USD_EXCHANGE_RATE,
  useFamilyFinance,
  useUpsertFamilyFinance,
} from '../hooks/useFamilyFinance'
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

type MoneyCurrency = 'ARS' | 'USD'
type FinanceEditorMetric = 'income' | 'savings'

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

  const expensesQuery = useExpenses(familyId, selectedCategoryId || undefined)
  const expenses = expensesQuery.data ?? EMPTY_EXPENSES
  const familyTotalQuery = useFamilyTotal(familyId)
  const familyFinanceQuery = useFamilyFinance(familyId)
  const upsertFamilyFinanceMutation = useUpsertFamilyFinance(familyId)

  const createExpenseMutation = useCreateExpense(familyId, userId)
  const updateExpenseMutation = useUpdateExpense(familyId)
  const deleteExpenseMutation = useDeleteExpense(familyId)

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

  const newPriceDisplay = formatPriceInputValue(newPrice, isNewPriceFocused)
  const editingPriceDisplay = formatPriceInputValue(editingPrice, isEditingPriceFocused)
  const financeEditorAmountDisplay = formatPriceInputValue(
    financeEditorAmount,
    isFinanceEditorAmountFocused,
    financeEditorCurrency,
  )
  const usdRateInputDisplay = formatPriceInputValue(usdRateInput, isUsdRateInputFocused)

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

  if (!familyId) {
    return null
  }

  const isBusy =
    createExpenseMutation.isPending ||
    updateExpenseMutation.isPending ||
    deleteExpenseMutation.isPending ||
    createCategoryMutation.isPending ||
    renameCategoryMutation.isPending ||
    deleteCategoryMutation.isPending ||
    updateDisplayNameMutation.isPending ||
    upsertFamilyFinanceMutation.isPending

  return (
    <IonPage>
      <IonHeader translucent>
        <IonToolbar>
          <IonTitle>Gastos Familia</IonTitle>
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
          <div className="family-header-card">
            <div className="family-header-row">
              <div className="family-user-row">
                <IonIcon className="family-header-icon" icon={peopleCircleOutline} />
                <div>
                  <p className="family-header-label">Familia compartida</p>
                  <p className="family-header-user">{displayName}</p>
                </div>
              </div>
              <span className="code-pill">{familyCode}</span>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent className="app-content" fullscreen>
        <div className="app-shell">
          <div className="overview-liquid-shell">
            <div
              className={`overview-liquid-card${
                familyTotalQuery.isLoading || familyFinanceQuery.isLoading ? ' is-loading' : ''
              }`}
            >
              <p className="overview-liquid-kicker">Total general</p>
              <p className="overview-liquid-value">
                {currencyFormatter.format(totalGeneral)}
              </p>
              <p className="price-usd-hint overview-liquid-usd">
                {formatUsdFromArs(totalGeneral, usdExchangeRate)}
              </p>

              <div className="overview-metrics-grid">
                <button
                  className="overview-metric-button"
                  disabled={upsertFamilyFinanceMutation.isPending}
                  onClick={() => openFinanceEditor('income')}
                  type="button"
                >
                  <span className="overview-metric-label">Total ingreso</span>
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
                  className="overview-metric-button"
                  disabled={upsertFamilyFinanceMutation.isPending}
                  onClick={() => openFinanceEditor('savings')}
                  type="button"
                >
                  <span className="overview-metric-label">Ahorro objetivo</span>
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

      <IonToast
        isOpen={isToastOpen}
        message={toastMessage}
        duration={2200}
        onDidDismiss={() => setToastOpen(false)}
      />
    </IonPage>
  )
}
