export type AccountKind = 'solo' | 'shared'

/** Clampa cualquier valor (DB, string suelto, null) a un AccountKind válido. */
export function normalizeAccountKind(value: string | null | undefined): AccountKind {
  return value === 'solo' ? 'solo' : 'shared'
}

/** True solo cuando el espacio es de un único usuario. */
export function isSolo(value: string | null | undefined): boolean {
  return value === 'solo'
}
