import { Redirect } from 'expo-router'

/**
 * Ruta LEGACY. El roster de integrantes y sus acciones se mudaron a "Mi hogar"
 * (`/(app)/household`) el 2026-08-17, donde además es visible en lectura para
 * cualquier integrante (antes era owner-only y un miembro rebotaba a Ajustes).
 *
 * La ruta sobrevive como redirección para no romper ningún enlace guardado en
 * el historial de navegación ni referencias externas. Cuando no quede ninguna,
 * se puede borrar el archivo.
 */
export default function FamilyAdminRoute() {
  return <Redirect href="/(app)/household" />
}
