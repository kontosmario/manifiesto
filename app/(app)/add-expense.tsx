import { useMemo } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { RequireAuth } from '@/components/guards'
import { ModalContentEntrance } from '@/components/ui/modal-content-entrance'
import { WizardSkinProvider, type WizardMode } from '@/components/wizard/wizard-skin'
import { AddGastoV2Screen } from '@/screens/home/add-gasto-v2-screen'
import { useThemeMode } from '@/theme/theme-provider'

/**
 * Parsea el parámetro de back-date (`YYYY-MM-DD`) a una fecha local a
 * medianoche. Devuelve null si falta, está mal formado o cae en el FUTURO
 * (guarda contra un deep-link armado a mano). Lo usa el calendario de Gastos
 * para "registrar gasto olvidado".
 */
function parseBackdateParam(raw: string | string[] | undefined): Date | null {
  if (typeof raw !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (date.getTime() > today.getTime()) return null
  return date
}

export default function AddExpenseRoute() {
  const params = useLocalSearchParams<{
    date?: string | string[]
    amount?: string
    description?: string
  }>()
  // Memoizado contra el PARÁMETRO, no recalculado por render: `Date` se compara
  // por identidad, y una instancia nueva en cada render viaja hasta el `reset`
  // de `useAddExpenseForm` y le rompe la memo al objeto del form entero.
  const initialForDate = useMemo(() => parseBackdateParam(params.date), [params.date])
  const prefillAmountRaw =
    typeof params.amount === 'string' ? Number(params.amount) : NaN
  const prefillAmount =
    Number.isFinite(prefillAmountRaw) && prefillAmountRaw > 0 ? prefillAmountRaw : undefined
  const prefillDescription =
    typeof params.description === 'string' && params.description.length > 0
      ? params.description
      : undefined
  const mode = useThemeMode().resolvedMode as WizardMode
  // El provider es lo único que dibuja el wizard con la piel del rediseño: el
  // skin se resuelve por CONTEXTO, así que montarlo acá también manda a su
  // rama neo a los componentes compartidos que el paso 1 monta adentro
  // (`AmountCard`, `SuggestedAmountStrip`, `CategoryHorizontalRail`).
  // Lo MONTAN cuatro superficies: `add-fixed-expense`, esta ruta,
  // `add-income` y el listado neo de fijos. Las que usan esos mismos
  // componentes SIN montarlo —import-review, el onboarding y
  // `numeric-edit-sheet`— siguen cayendo a su rama de siempre. Antes de tocar
  // un compartido, esa es la lista de consumidores que hay que mirar.
  return (
    <ModalContentEntrance style={{ flex: 1 }}>
      <RequireAuth>
        {({ familyId, userId }) => (
          <WizardSkinProvider mode={mode}>
            <AddGastoV2Screen
              familyId={familyId}
              userId={userId}
              initialForDate={initialForDate}
              prefillAmount={prefillAmount}
              prefillDescription={prefillDescription}
            />
          </WizardSkinProvider>
        )}
      </RequireAuth>
    </ModalContentEntrance>
  )
}
