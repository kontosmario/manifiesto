import type { FamilyMemberRole } from './use-family-admin'

/** Etiqueta humana del rol para los badges. */
export function roleLabel(role: FamilyMemberRole): string {
  if (role === 'owner') return 'Dueño'
  if (role === 'blocked') return 'Bloqueado'
  return 'Miembro'
}

/** "Integrante desde abril 2026" — fecha de alta del integrante. */
export function formatMemberSince(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'Integrante'
  try {
    const formatted = parsed.toLocaleDateString('es-AR', {
      month: 'long',
      year: 'numeric',
    })
    return `Integrante desde ${formatted}`
  } catch {
    return 'Integrante'
  }
}

/** "Hoy" / "Ayer" / "Hace N días" — última actividad relativa. */
export function formatRelative(iso: string | null): string {
  if (!iso) return 'Sin actividad'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'Sin actividad'
  const diffMs = Date.now() - then
  const day = 24 * 60 * 60 * 1000
  const days = Math.floor(diffMs / day)
  if (days <= 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 30) return `Hace ${days} días`
  const months = Math.floor(days / 30)
  if (months < 12) return months === 1 ? 'Hace 1 mes' : `Hace ${months} meses`
  const years = Math.floor(days / 365)
  return years === 1 ? 'Hace 1 año' : `Hace ${years} años`
}
