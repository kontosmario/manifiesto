import { useMemo, useState } from 'react'
import {
  IonAlert,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import {
  addOutline,
  copyOutline,
  createOutline,
  logOutOutline,
  peopleCircleOutline,
  pencilOutline,
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
  useUpdateExpense,
  type Expense,
} from '../hooks/useExpenses'
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

function parsePrice(rawValue: string): number {
  return Number(rawValue.replace(',', '.'))
}

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
})

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

  const createExpenseMutation = useCreateExpense(familyId, userId)
  const updateExpenseMutation = useUpdateExpense(familyId)
  const deleteExpenseMutation = useDeleteExpense(familyId)

  const createCategoryMutation = useCreateCategory(familyId)
  const renameCategoryMutation = useRenameCategory(familyId)
  const deleteCategoryMutation = useDeleteCategory(familyId)

  const updateDisplayNameMutation = useUpdateDisplayName(userId)

  const [newDescription, setNewDescription] = useState('')
  const [newPrice, setNewPrice] = useState('')

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [editingDescription, setEditingDescription] = useState('')
  const [editingPrice, setEditingPrice] = useState('')

  const [isCategoriesModalOpen, setCategoriesModalOpen] = useState(false)
  const [isNewCategoryAlertOpen, setNewCategoryAlertOpen] = useState(false)
  const [renameTargetCategory, setRenameTargetCategory] = useState<Category | null>(null)
  const [isDisplayNameAlertOpen, setDisplayNameAlertOpen] = useState(false)

  const [toastMessage, setToastMessage] = useState('')
  const [isToastOpen, setToastOpen] = useState(false)

  const totalForCategory = useMemo(() => {
    return expenses.reduce((sum, expense) => sum + expense.price, 0)
  }, [expenses])

  const showToast = (message: string) => {
    setToastMessage(message)
    setToastOpen(true)
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
    setEditingPrice(expense.price.toString())
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
    updateDisplayNameMutation.isPending

  return (
    <IonPage>
      <IonHeader translucent>
        <IonToolbar>
          <IonTitle>Gastos Familia</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={handleLogout}>
              <IonIcon icon={logOutOutline} slot="start" />
              Salir
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="app-content" fullscreen>
        <div className="app-shell">
          <IonCard className="panel-card">
            <IonCardHeader>
              <IonCardTitle>Familia compartida</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <div className="inline-info">
                <IonIcon icon={peopleCircleOutline} />
                <span>{displayName}</span>
              </div>

              <div className="inline-info between">
                <strong>Family Code:</strong>
                <span className="code-pill">{familyCode}</span>
              </div>

              <div className="action-row two-columns">
                <IonButton fill="outline" onClick={handleCopyCode}>
                  <IonIcon icon={copyOutline} slot="start" />
                  Copiar código
                </IonButton>

                <IonButton fill="outline" onClick={() => setDisplayNameAlertOpen(true)}>
                  <IonIcon icon={pencilOutline} slot="start" />
                  Cambiar nombre
                </IonButton>
              </div>
            </IonCardContent>
          </IonCard>

          <IonCard className="panel-card">
            <IonCardHeader>
              <IonCardTitle>Categoría activa</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <IonItem lines="full">
                <IonLabel position="stacked">Seleccionar categoría</IonLabel>
                <IonSelect
                  interface="popover"
                  placeholder="Elegí una categoría"
                  value={selectedCategoryId}
                  onIonChange={(event) => setCategorySelection(event.detail.value)}
                >
                  {categories.map((category) => (
                    <IonSelectOption key={category.id} value={category.id}>
                      {category.name}
                    </IonSelectOption>
                  ))}
                </IonSelect>
              </IonItem>

              <IonButton
                className="manage-button"
                expand="block"
                fill="outline"
                onClick={() => setCategoriesModalOpen(true)}
              >
                <IonIcon icon={createOutline} slot="start" />
                Gestionar categorías
              </IonButton>
            </IonCardContent>
          </IonCard>

          <IonCard className="panel-card">
            <IonCardHeader>
              <IonCardTitle>Nuevo gasto</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <IonItem lines="full">
                <IonLabel position="stacked">Descripción</IonLabel>
                <IonInput
                  placeholder="Ej: Hamburguesa"
                  type="text"
                  value={newDescription}
                  onIonInput={(event) => setNewDescription(event.detail.value ?? '')}
                />
              </IonItem>

              <IonItem lines="none">
                <IonLabel position="stacked">Precio</IonLabel>
                <IonInput
                  inputmode="decimal"
                  placeholder="12000"
                  type="number"
                  value={newPrice}
                  onIonInput={(event) => setNewPrice(event.detail.value ?? '')}
                />
              </IonItem>

              <IonButton disabled={isBusy} expand="block" onClick={handleAddExpense}>
                <IonIcon icon={addOutline} slot="start" />
                Agregar gasto
              </IonButton>
            </IonCardContent>
          </IonCard>

          <IonCard className="panel-card total-card">
            <IonCardContent>
              <p className="total-label">Total de la categoría</p>
              <p className="total-value">{currencyFormatter.format(totalForCategory)}</p>
            </IonCardContent>
          </IonCard>

          <IonCard className="panel-card">
            <IonCardHeader>
              <IonCardTitle>Gastos</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
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

              <IonList className="expenses-list">
                {expenses.map((expense) => (
                  <IonCard className="expense-card" key={expense.id}>
                    <IonCardContent>
                      <div className="expense-head">
                        <strong>{expense.description}</strong>
                        <strong>{currencyFormatter.format(expense.price)}</strong>
                      </div>

                      <p className="expense-author">{expense.creator_display_name}</p>

                      <div className="action-row two-columns">
                        <IonButton fill="clear" onClick={() => openEditExpense(expense)}>
                          <IonIcon icon={pencilOutline} slot="start" />
                          Editar
                        </IonButton>

                        <IonButton
                          color="danger"
                          fill="clear"
                          onClick={() => handleDeleteExpense(expense.id)}
                        >
                          <IonIcon icon={trashOutline} slot="start" />
                          Borrar
                        </IonButton>
                      </div>
                    </IonCardContent>
                  </IonCard>
                ))}
              </IonList>
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>

      <IonModal isOpen={isCategoriesModalOpen} onDidDismiss={() => setCategoriesModalOpen(false)}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Categorías</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setCategoriesModalOpen(false)}>Cerrar</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>

        <IonContent>
          <div className="modal-shell">
            <IonButton expand="block" onClick={() => setNewCategoryAlertOpen(true)}>
              <IonIcon icon={addOutline} slot="start" />
              Nueva categoría
            </IonButton>

            <IonList>
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
        </IonContent>
      </IonModal>

      <IonModal isOpen={Boolean(editingExpense)} onDidDismiss={() => setEditingExpense(null)}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Editar gasto</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setEditingExpense(null)}>Cerrar</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>

        <IonContent>
          <div className="modal-shell">
            <IonItem lines="full">
              <IonLabel position="stacked">Descripción</IonLabel>
              <IonInput
                type="text"
                value={editingDescription}
                onIonInput={(event) => setEditingDescription(event.detail.value ?? '')}
              />
            </IonItem>

            <IonItem lines="none">
              <IonLabel position="stacked">Precio</IonLabel>
              <IonInput
                inputmode="decimal"
                type="number"
                value={editingPrice}
                onIonInput={(event) => setEditingPrice(event.detail.value ?? '')}
              />
            </IonItem>

            <IonButton disabled={isBusy} expand="block" onClick={handleUpdateExpense}>
              Guardar cambios
            </IonButton>
          </div>
        </IonContent>
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

      <IonToast
        isOpen={isToastOpen}
        message={toastMessage}
        duration={2200}
        onDidDismiss={() => setToastOpen(false)}
      />
    </IonPage>
  )
}
