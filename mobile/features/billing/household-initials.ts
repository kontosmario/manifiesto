/**
 * Lógica pura de iniciales (sin imports de RN/supabase) para que sea
 * testeable en el env node de vitest. El hook con red vive en
 * use-household-initials.ts.
 */

/** Primera letra de hasta 2 palabras, en mayúscula. `'?'` si está vacío. */
export function toInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
}
