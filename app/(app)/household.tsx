import { RequireAuth } from '@/components/guards'
import { HouseholdScreen } from '@/screens/household/household-screen'

/**
 * "Mi hogar" — la sección que unifica la gestión del espacio compartido que
 * antes vivía repartida en Ajustes (§Hogar, §Familia, §Tipo de cuenta) y en la
 * pantalla owner-only `/settings/family-admin`.
 *
 * SIN guard de dueño, a diferencia de `settings/family-admin`: la pantalla se
 * auto-gatea fila por fila (el roster es de LECTURA para cualquier integrante;
 * invitar, bloquear, eliminar y configurar el ciclo siguen siendo del dueño).
 */
export default function HouseholdRoute() {
  return (
    <RequireAuth>
      {({ familyId, userId }) => (
        <HouseholdScreen familyId={familyId} userId={userId} />
      )}
    </RequireAuth>
  )
}
