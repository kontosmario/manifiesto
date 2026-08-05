import { RequireAuth } from '@/components/guards'
import { ModalContentEntrance } from '@/components/ui/modal-content-entrance'
import { WizardSkinProvider, type WizardMode } from '@/components/wizard/wizard-skin'
import { AddIncomeV2Screen } from '@/screens/home/add-income-v2-screen'
import { useThemeMode } from '@/theme/theme-provider'

export default function AddIncomeRoute() {
  const mode = useThemeMode().resolvedMode as WizardMode
  // El provider es lo único que dibuja el wizard con la piel del rediseño: el
  // skin se resuelve por CONTEXTO, así que montarlo acá alcanza a `AmountCard`,
  // `SuggestedAmountStrip` y el rail de tiles —que son compartidos— sin tocar a
  // las otras pantallas que los montan sin provider (siguen en `classic`).
  return (
    <ModalContentEntrance style={{ flex: 1 }}>
      <RequireAuth>
        {({ familyId, userId }) => (
          <WizardSkinProvider mode={mode}>
            {/* `userId` es load-bearing: sin él el evento optimista queda con
                `created_by` vacío. Ver el docblock de la pantalla. */}
            <AddIncomeV2Screen familyId={familyId} userId={userId} />
          </WizardSkinProvider>
        )}
      </RequireAuth>
    </ModalContentEntrance>
  )
}
