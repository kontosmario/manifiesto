import { useLocalSearchParams } from 'expo-router'
import { RequireAuth } from '@/components/guards'
import { FijosSkinProvider } from '@/components/fijos/fijos-skin'
import { ModalContentEntrance } from '@/components/ui/modal-content-entrance'
import { AddFijoV2Screen } from '@/screens/home/add-fijo-v2-screen'
import { useThemeMode } from '@/theme/theme-provider'
import type { FijosMode } from '@/components/redesign/fijos/fijos-spec'

export default function AddFixedExpenseRoute() {
  const params = useLocalSearchParams<{
    id?: string
    amount?: string
    description?: string
  }>()
  const fixedExpenseId =
    typeof params.id === 'string' && params.id.trim().length > 0
      ? params.id
      : undefined
  const prefillAmountRaw =
    typeof params.amount === 'string' ? Number(params.amount) : NaN
  const prefillAmount =
    Number.isFinite(prefillAmountRaw) && prefillAmountRaw > 0
      ? prefillAmountRaw
      : undefined
  const prefillDescription =
    typeof params.description === 'string' && params.description.length > 0
      ? params.description
      : undefined
  const mode = useThemeMode().resolvedMode as FijosMode
  // El wizard es el MISMO componente que ya corría acá; el provider es lo
  // único que lo dibuja con la piel del rediseño (ver el docblock de
  // `fijos-skin.tsx`). Como el skin se resuelve por contexto, esto NO alcanza
  // a add-gasto ni a add-ingreso: comparten `AmountCard` y los rails, pero no
  // montan el provider y siguen cayendo a su rama de siempre.
  return (
    <ModalContentEntrance style={{ flex: 1 }}>
      <RequireAuth>
        {({ familyId, userId }) => (
          <FijosSkinProvider mode={mode}>
            <AddFijoV2Screen
              familyId={familyId}
              userId={userId}
              fixedExpenseId={fixedExpenseId}
              prefillAmount={prefillAmount}
              prefillDescription={prefillDescription}
            />
          </FijosSkinProvider>
        )}
      </RequireAuth>
    </ModalContentEntrance>
  )
}
