/**
 * Espejo del pathname actual de expo-router en una variable de módulo,
 * para consumidores que corren FUERA del árbol de React — concretamente
 * `app/+native-intent.ts` (redirectSystemPath no tiene acceso a hooks).
 *
 * Lo setea <PathnameMirror/> (montado en el root) en cada cambio de ruta.
 */

let currentPathname: string | null = null

export function setCurrentPathname(path: string): void {
  currentPathname = path
}

export function getCurrentPathname(): string | null {
  return currentPathname
}
