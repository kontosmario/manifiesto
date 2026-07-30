import { Redirect } from 'expo-router'
import { RequireAuth } from '@/components/guards'
import { FijosSkinProvider } from '@/components/fijos/fijos-skin'
import { useThemeMode } from '@/theme/theme-provider'
import type { FijosMode } from '@/components/redesign/fijos/fijos-spec'

// ALTA DE FIJO neo — el MISMO wizard de 2 pasos que ya corre en producción
// (`AddFijoV2Screen`), envuelto en `FijosSkinProvider` para que se dibuje con
// la piel del rediseño.
//
// Por qué una ruta aparte y no re-estilar la viva: `app/(app)/add-fixed-expense`
// monta esta misma pantalla y es la que usa el usuario hoy. El provider es lo
// ÚNICO que separa las dos: sin él, cada componente resuelve sus tokens de
// siempre (ver el docblock de `fijos-skin.tsx`), así que la ruta viva no puede
// cambiar por accidente.
//
// La lógica NO se toca: `useAddFijoForm`, el impact math, el calendario y el
// encadenado create/update/record-payment son los mismos. Esto es piel.
//
// OJO — las escrituras son REALES contra producción: confirmar en el paso 2
// crea el fijo de verdad.
export default function Page() {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AddFijoV2Screen } = require('@/screens/home/add-fijo-v2-screen') as typeof import('@/screens/home/add-fijo-v2-screen')
    return <NeoAddFijoPreview Screen={AddFijoV2Screen} />
  }
  return <Redirect href="/(app)/settings" />
}

function NeoAddFijoPreview({
  Screen,
}: {
  Screen: typeof import('@/screens/home/add-fijo-v2-screen').AddFijoV2Screen
}) {
  const mode = useThemeMode().resolvedMode as FijosMode
  return (
    <RequireAuth>
      {({ familyId }) => (
        <FijosSkinProvider mode={mode}>
          <Screen familyId={familyId} />
        </FijosSkinProvider>
      )}
    </RequireAuth>
  )
}
