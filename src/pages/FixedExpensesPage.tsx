import { useMemo, useState, type CSSProperties } from 'react'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import { addOutline, chevronBackOutline, pencilOutline, trashOutline } from 'ionicons/icons'
import { useHistory } from 'react-router-dom'
import { useAuthSession } from '../hooks/useAuthSession'
import { DEFAULT_USD_EXCHANGE_RATE, useFamilyFinance } from '../hooks/useFamilyFinance'
import {
  useCreateFixedExpense,
  useDeleteFixedExpense,
  useFixedExpenses,
  useUpdateFixedExpense,
  type FixedExpense,
} from '../hooks/useFixedExpenses'
import { useFamily } from '../hooks/useFamily'
import { getErrorMessage } from '../utils/errorMessage'
import {
  currencyFormatter,
  formatPriceInputValue,
  formatUsdFromArs,
  normalizePriceInput,
  parsePrice,
  serializePrice,
} from '../utils/money'
import './pages.css'

const EMPTY_FIXED_EXPENSES: FixedExpense[] = []

export default function FixedExpensesPage() {
  const history = useHistory()
  const { data: session } = useAuthSession()
  const userId = session?.user.id

  const { data: family } = useFamily(userId)
  const familyId = family?.familyId

  const fixedExpensesQuery = useFixedExpenses(familyId)
  const fixedExpenses = fixedExpensesQuery.data ?? EMPTY_FIXED_EXPENSES
  const familyFinanceQuery = useFamilyFinance(familyId)

  const createFixedExpenseMutation = useCreateFixedExpense(familyId)
  const updateFixedExpenseMutation = useUpdateFixedExpense(familyId)
  const deleteFixedExpenseMutation = useDeleteFixedExpense(familyId)

  const usdExchangeRate =
    familyFinanceQuery.data?.usd_exchange_rate ?? DEFAULT_USD_EXCHANGE_RATE
  const fixedExpensesMonthlyTotal = useMemo(() => {
    return fixedExpenses.reduce((sum, fixedExpense) => sum + fixedExpense.amount, 0)
  }, [fixedExpenses])

  const [isAddFixedExpenseModalOpen, setAddFixedExpenseModalOpen] = useState(false)
  const [newFixedExpenseName, setNewFixedExpenseName] = useState('')
  const [newFixedExpenseAmount, setNewFixedExpenseAmount] = useState('')
  const [isNewFixedExpenseAmountFocused, setNewFixedExpenseAmountFocused] = useState(false)
  const [editingFixedExpense, setEditingFixedExpense] = useState<FixedExpense | null>(null)
  const [editingFixedExpenseName, setEditingFixedExpenseName] = useState('')
  const [editingFixedExpenseAmount, setEditingFixedExpenseAmount] = useState('')
  const [isEditingFixedExpenseAmountFocused, setEditingFixedExpenseAmountFocused] =
    useState(false)

  const [toastMessage, setToastMessage] = useState('')
  const [isToastOpen, setToastOpen] = useState(false)

  const showToast = (message: string) => {
    setToastMessage(message)
    setToastOpen(true)
  }

  const isBusy =
    createFixedExpenseMutation.isPending ||
    updateFixedExpenseMutation.isPending ||
    deleteFixedExpenseMutation.isPending

  const newFixedExpenseAmountDisplay = formatPriceInputValue(
    newFixedExpenseAmount,
    isNewFixedExpenseAmountFocused,
  )
  const editingFixedExpenseAmountDisplay = formatPriceInputValue(
    editingFixedExpenseAmount,
    isEditingFixedExpenseAmountFocused,
  )

  const closeAddFixedExpenseModal = () => {
    setAddFixedExpenseModalOpen(false)
    setNewFixedExpenseName('')
    setNewFixedExpenseAmount('')
    setNewFixedExpenseAmountFocused(false)
  }

  const openEditFixedExpense = (fixedExpense: FixedExpense) => {
    setEditingFixedExpense(fixedExpense)
    setEditingFixedExpenseName(fixedExpense.name)
    setEditingFixedExpenseAmount(serializePrice(fixedExpense.amount))
    setEditingFixedExpenseAmountFocused(false)
  }

  const closeEditFixedExpenseModal = () => {
    setEditingFixedExpense(null)
    setEditingFixedExpenseName('')
    setEditingFixedExpenseAmount('')
    setEditingFixedExpenseAmountFocused(false)
  }

  const handleAddFixedExpense = () => {
    const amount = parsePrice(newFixedExpenseAmount)
    if (!newFixedExpenseName.trim() || !Number.isFinite(amount) || amount < 0) {
      showToast('Completá nombre y monto válido para el gasto fijo (>= 0).')
      return
    }

    createFixedExpenseMutation.mutate(
      {
        name: newFixedExpenseName,
        amount,
      },
      {
        onSuccess: () => {
          closeAddFixedExpenseModal()
          showToast('Gasto fijo agregado.')
        },
        onError: (error: unknown) => {
          showToast(getErrorMessage(error, 'No se pudo crear el gasto fijo.'))
        },
      },
    )
  }

  const handleUpdateFixedExpense = () => {
    if (!editingFixedExpense) {
      return
    }

    const amount = parsePrice(editingFixedExpenseAmount)
    if (!editingFixedExpenseName.trim() || !Number.isFinite(amount) || amount < 0) {
      showToast('Completá nombre y monto válido para editar el gasto fijo.')
      return
    }

    updateFixedExpenseMutation.mutate(
      {
        fixedExpenseId: editingFixedExpense.id,
        name: editingFixedExpenseName,
        amount,
      },
      {
        onSuccess: () => {
          closeEditFixedExpenseModal()
          showToast('Gasto fijo actualizado.')
        },
        onError: (error: unknown) => {
          showToast(getErrorMessage(error, 'No se pudo editar el gasto fijo.'))
        },
      },
    )
  }

  const handleDeleteFixedExpense = (fixedExpenseId: string) => {
    const shouldDelete = window.confirm('¿Querés borrar este gasto fijo?')
    if (!shouldDelete) {
      return
    }

    deleteFixedExpenseMutation.mutate(fixedExpenseId, {
      onSuccess: () => {
        showToast('Gasto fijo borrado.')
      },
      onError: (error: unknown) => {
        showToast(getErrorMessage(error, 'No se pudo borrar el gasto fijo.'))
      },
    })
  }

  if (!familyId) {
    return null
  }

  const appThemeStyles = {
    '--app-bg-start': 'rgba(185, 226, 203, 0.28)',
    '--app-bg-mid': 'rgba(242, 251, 246, 0.5)',
    '--app-bg-end': '#f6f7f8',
    '--app-toolbar-bg': 'rgba(185, 226, 203, 0.26)',
    '--app-title-color': '#1e5a44',
  } as CSSProperties

  return (
    <IonPage style={appThemeStyles}>
      <IonHeader translucent>
        <IonToolbar className="app-main-toolbar">
          <IonButtons slot="start">
            <IonButton
              aria-label="Volver al dashboard"
              onClick={() => {
                if (history.length > 1) {
                  history.goBack()
                  return
                }

                history.replace('/app')
              }}
            >
              <IonIcon icon={chevronBackOutline} />
            </IonButton>
          </IonButtons>
          <IonTitle className="app-main-title">Gastos Fijos</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="app-content" fullscreen>
        <div className="app-shell">
          <div
            className={`fixed-expenses-liquid-card${
              fixedExpensesQuery.isLoading || familyFinanceQuery.isLoading ? ' is-loading' : ''
            }`}
          >
            <div className="fixed-expenses-liquid-top">
              <p className="fixed-expenses-liquid-kicker">Gastos fijos mensuales</p>

              <IonButton
                className="fixed-expenses-liquid-add"
                disabled={isBusy}
                fill="clear"
                onClick={() => setAddFixedExpenseModalOpen(true)}
              >
                <IonIcon icon={addOutline} slot="start" />
                Agregar
              </IonButton>
            </div>

            <div className="fixed-expenses-total-chip">
              <div className="fixed-expenses-total-main">
                <span className="fixed-expenses-total-label">Total mensual fijo</span>
                <strong className="fixed-expenses-total-value">
                  {currencyFormatter.format(fixedExpensesMonthlyTotal)}
                </strong>
              </div>
              <span className="price-usd-hint">
                {formatUsdFromArs(fixedExpensesMonthlyTotal, usdExchangeRate)}
              </span>
            </div>

            {fixedExpensesQuery.isLoading ? (
              <div className="loading-row">
                <IonSpinner name="crescent" />
              </div>
            ) : null}

            {!fixedExpensesQuery.isLoading && fixedExpensesQuery.error ? (
              <IonText color="danger">
                <p className="empty-message">No se pudieron cargar los gastos fijos.</p>
              </IonText>
            ) : null}

            {!fixedExpensesQuery.isLoading && !fixedExpensesQuery.error && fixedExpenses.length === 0 ? (
              <IonText color="medium">
                <p className="empty-message">
                  No hay gastos fijos todavía. Agregalos para descontarlos del disponible.
                </p>
              </IonText>
            ) : null}

            <div className="fixed-expenses-list">
              {fixedExpenses.map((fixedExpense) => (
                <article className="fixed-expense-item" key={fixedExpense.id}>
                  <div className="fixed-expense-main">
                    <div className="fixed-expense-texts">
                      <p className="fixed-expense-name">{fixedExpense.name}</p>
                      <p className="price-usd-hint fixed-expense-usd">
                        {formatUsdFromArs(fixedExpense.amount, usdExchangeRate)}
                      </p>
                    </div>

                    <div className="fixed-expense-right">
                      <p className="fixed-expense-amount">
                        {currencyFormatter.format(fixedExpense.amount)}
                      </p>

                      <div className="fixed-expense-actions">
                        <button
                          aria-label="Editar gasto fijo"
                          className="fixed-expense-action"
                          disabled={isBusy}
                          onClick={() => openEditFixedExpense(fixedExpense)}
                          type="button"
                        >
                          <IonIcon icon={pencilOutline} />
                        </button>

                        <button
                          aria-label="Borrar gasto fijo"
                          className="fixed-expense-action is-danger"
                          disabled={isBusy}
                          onClick={() => handleDeleteFixedExpense(fixedExpense.id)}
                          type="button"
                        >
                          <IonIcon icon={trashOutline} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </IonContent>

      <IonModal
        className="content-fit-modal"
        isOpen={isAddFixedExpenseModalOpen}
        onDidDismiss={closeAddFixedExpenseModal}
      >
        <div className="content-fit-modal-shell">
          <div className="content-fit-modal-header">
            <p className="content-fit-modal-title">Nuevo gasto fijo</p>
            <IonButton fill="clear" onClick={closeAddFixedExpenseModal}>
              Cerrar
            </IonButton>
          </div>

          <div className="expense-liquid-card">
            <div className="expense-field-group">
              <label className="expense-field-label" htmlFor="fixed-expense-name-modal-input">
                Nombre
              </label>
              <IonInput
                id="fixed-expense-name-modal-input"
                className="expense-liquid-input"
                placeholder="Ej: Alquiler"
                type="text"
                value={newFixedExpenseName}
                onIonInput={(event) => setNewFixedExpenseName(event.detail.value ?? '')}
              />
            </div>

            <div className="expense-field-group">
              <label className="expense-field-label" htmlFor="fixed-expense-amount-modal-input">
                Monto mensual
              </label>
              <IonInput
                id="fixed-expense-amount-modal-input"
                className="expense-liquid-input expense-liquid-price"
                inputmode="decimal"
                placeholder="$ 0"
                type="text"
                value={newFixedExpenseAmountDisplay}
                onIonInput={(event) =>
                  setNewFixedExpenseAmount(normalizePriceInput(event.detail.value ?? ''))
                }
                onIonFocus={() => setNewFixedExpenseAmountFocused(true)}
                onIonBlur={() => setNewFixedExpenseAmountFocused(false)}
              />
            </div>

            <IonButton
              className="expense-liquid-submit"
              disabled={isBusy}
              expand="block"
              onClick={handleAddFixedExpense}
            >
              <IonIcon icon={addOutline} slot="start" />
              Agregar gasto fijo
            </IonButton>
          </div>
        </div>
      </IonModal>

      <IonModal
        className="content-fit-modal"
        isOpen={Boolean(editingFixedExpense)}
        onDidDismiss={closeEditFixedExpenseModal}
      >
        <div className="content-fit-modal-shell">
          <div className="content-fit-modal-header">
            <p className="content-fit-modal-title">Editar gasto fijo</p>
            <IonButton fill="clear" onClick={closeEditFixedExpenseModal}>
              Cerrar
            </IonButton>
          </div>

          <div className="expense-liquid-card">
            <div className="expense-field-group">
              <label className="expense-field-label" htmlFor="fixed-expense-edit-name-input">
                Nombre
              </label>
              <IonInput
                id="fixed-expense-edit-name-input"
                className="expense-liquid-input"
                type="text"
                value={editingFixedExpenseName}
                onIonInput={(event) => setEditingFixedExpenseName(event.detail.value ?? '')}
              />
            </div>

            <div className="expense-field-group">
              <label className="expense-field-label" htmlFor="fixed-expense-edit-amount-input">
                Monto mensual
              </label>
              <IonInput
                id="fixed-expense-edit-amount-input"
                className="expense-liquid-input expense-liquid-price"
                inputmode="decimal"
                type="text"
                value={editingFixedExpenseAmountDisplay}
                onIonInput={(event) =>
                  setEditingFixedExpenseAmount(normalizePriceInput(event.detail.value ?? ''))
                }
                onIonFocus={() => setEditingFixedExpenseAmountFocused(true)}
                onIonBlur={() => setEditingFixedExpenseAmountFocused(false)}
              />
            </div>

            <IonButton
              className="expense-liquid-submit"
              disabled={isBusy}
              expand="block"
              onClick={handleUpdateFixedExpense}
            >
              Guardar cambios
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
