import { useFamilyMembers } from '@/features/family/use-family-members'
import { toInitials } from '@/features/billing/household-initials'

/**
 * Iniciales para los avatares de "Mi suscripción". La lógica pura
 * (`toInitials`, en household-initials.ts) se testea en vitest; este hook
 * delega en `useFamilyMembers` (react-query) y no se testea en el env node.
 */

export { toInitials } from '@/features/billing/household-initials'

/** Devuelve las iniciales de cada miembro del hogar + el total. */
export function useHouseholdInitials(familyId?: string): {
  initials: string[]
  count: number
} {
  const { data } = useFamilyMembers(familyId)
  const members = data ?? []
  return {
    initials: members.map((m) => toInitials(m.name)),
    count: members.length,
  }
}
