import { useFamily } from '@/features/family/use-family'
import { isSolo } from '@/features/family/account-kind'

/**
 * Deriva si el espacio del usuario es "solo" (familia invisible de 1).
 * Lee de la misma cache que useFamily (['family', userId]) — sin fetch extra.
 * Mientras la familia carga devuelve false (default seguro = mostrar UI de familia).
 */
export function useIsSolo(userId?: string): boolean {
  const familyQuery = useFamily(userId)
  return isSolo(familyQuery.data?.kind)
}
