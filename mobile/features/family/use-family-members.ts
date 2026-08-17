import { useQuery } from '@tanstack/react-query'
import { isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import type { FamilyMemberRole } from '@/features/family/use-family-admin'
import { supabase } from '@/lib/supabase'

export interface FamilyMemberRow {
  id: string
  name: string
  color: string
  avatarSlug: AvatarSlug | null
  /**
   * Rol en el hogar. Se agregó el 2026-08-17 porque el roster crudo incluye a
   * los BLOQUEADOS y varios consumidores lo usaban como si fuera la lista de
   * activos (la píldora del Home decía "Miembros · 3" en un hogar de 2 con 1
   * bloqueado, mientras Ajustes decía "2 activos · 1 bloqueado").
   *
   * La fila bloqueada NO se filtra acá: los lookups por id (autor de un gasto,
   * de una notificación) tienen que seguir resolviendo el avatar de alguien que
   * fue bloqueado después de haber cargado datos. Quien necesite la lista de
   * activos usa `activeFamilyMembers()`.
   */
  role: FamilyMemberRole
}

export const familyMembersKey = (familyId?: string) => ['family-members', familyId ?? null] as const

const COLOR_POOL = ['#2E7D5B', '#E08E63', '#6B3A4F', '#C9A23A', '#4D6FB3', '#8A4D9A']

/**
 * Integrantes ACTIVOS del hogar — lo que cuenta y muestra cualquier superficie
 * que hable de "los miembros" (la píldora del Home, los avatares del plan).
 * Un bloqueado sigue existiendo en la tabla pero ya no forma parte del hogar.
 */
export function activeFamilyMembers(rows: FamilyMemberRow[] | undefined): FamilyMemberRow[] {
  return (rows ?? []).filter((m) => m.role !== 'blocked')
}

function parseMemberRole(raw: unknown): FamilyMemberRole {
  if (raw === 'owner' || raw === 'blocked') return raw
  return 'member'
}

/**
 * Fetches display info for every member of a family. We can't use a
 * single-shot select with a `profiles(...)` embed because
 * `family_members.user_id` and `profiles.id` both reference
 * `auth.users(id)` — PostgREST can't infer a direct FK between the
 * two tables, so it answers 400 on the implicit join. Instead: fetch
 * members first, then their profiles in a second round-trip.
 */
export function useFamilyMembers(familyId?: string) {
  return useQuery<FamilyMemberRow[]>({
    queryKey: familyMembersKey(familyId),
    enabled: Boolean(familyId),
    // Family roster rarely flips mid-session. Bumped from 60s so tab
    // switches don't trigger silent refetches.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!familyId) return []

      const membersResponse = await supabase
        .from('family_members')
        .select('user_id, role')
        .eq('family_id', familyId)
      if (membersResponse.error) throw membersResponse.error

      // Dueño primero y bloqueados al final — MISMO orden que
      // `family_member_stats()` y que el payload de `home_snapshot()`, así el
      // stack de avatares no depende de qué camino llenó la cache.
      const roleRank = (role: FamilyMemberRole) =>
        role === 'owner' ? 0 : role === 'member' ? 1 : 2
      const rows = [...(membersResponse.data ?? [])]
        .map((m) => ({
          userId: m.user_id as string,
          role: parseMemberRole((m as { role?: unknown }).role),
        }))
        .sort((a, b) => roleRank(a.role) - roleRank(b.role))
      const userIds = rows.map((m) => m.userId)
      if (userIds.length === 0) return []

      const profilesResponse = await supabase
        .from('profiles')
        .select('id, display_name, avatar_animal')
        .in('id', userIds)
      if (profilesResponse.error) throw profilesResponse.error

      const nameById = new Map<string, string>()
      const avatarById = new Map<string, AvatarSlug | null>()
      for (const p of profilesResponse.data ?? []) {
        if (p.id && typeof p.display_name === 'string') {
          nameById.set(p.id, p.display_name)
        }
        if (p.id) {
          const raw = (p as { avatar_animal?: unknown }).avatar_animal
          avatarById.set(
            p.id,
            typeof raw === 'string' && isAvatarSlug(raw) ? raw : null,
          )
        }
      }

      return rows.map((row, i) => ({
        id: row.userId,
        // Empty string when display_name is missing — `Avatar` falls
        // back to a person silhouette in that case. Previously this
        // was '—' which rendered as a stranded em dash inside the
        // colored circle (looked like a broken icon).
        name: nameById.get(row.userId) ?? '',
        color: COLOR_POOL[i % COLOR_POOL.length],
        avatarSlug: avatarById.get(row.userId) ?? null,
        role: row.role,
      }))
    },
  })
}
