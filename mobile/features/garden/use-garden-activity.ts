import { useQuery } from '@tanstack/react-query'
import { fetchGardenActivity, type GardenActivityRow } from './garden-activity-repository'
import { gardenActivityQueryKey } from './garden-query-keys'

/**
 * Fuente de actividad del jardín/racha — deliberadamente SEPARADA de
 * `useExpenses`.
 *
 * Dos razones para que sea una key propia y no un parámetro de la existente:
 *  · `useExpenses` filtra archivados y ESO es load-bearing (su cache la siembra
 *    `home_snapshot`; sin el filtro el saldo del Home oscila entre dos números).
 *  · el payload de `home_snapshot` viene capeado a 120 filas, así que en frío
 *    la lista compartida trunca el historial además de filtrarlo.
 * Compartir la key significaría heredar los dos recortes. Ver el docblock de
 * `garden-activity-repository.ts` para el bug que esto arregla.
 */
export function useGardenActivity(familyId: string | undefined) {
  return useQuery<GardenActivityRow[]>({
    queryKey: gardenActivityQueryKey(familyId),
    enabled: Boolean(familyId),
    // Mismo criterio que el resto del cluster: las escrituras invalidan esta
    // key por `syncAllAfterMutation` (scope `expenses`), así que no hace falta
    // refetch periódico.
    staleTime: 5 * 60_000,
    queryFn: () => fetchGardenActivity(familyId!),
  })
}
