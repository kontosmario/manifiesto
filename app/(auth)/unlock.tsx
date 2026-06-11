import { Redirect } from 'expo-router'

// La superficie de unlock vive ahora en BootScreen (`/` + máquina
// auth-flow, spec 2026-06-11). Cualquier navegación vieja a /unlock
// rebota al boot. La ruta se elimina del árbol en la Etapa 5.
export default function UnlockRoute() {
  return <Redirect href="/" />
}
