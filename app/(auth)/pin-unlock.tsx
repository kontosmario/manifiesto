import { Redirect } from 'expo-router'

// El PIN unlock vive ahora como PinLockPanel embebido en BootScreen
// (`/` + máquina auth-flow, spec 2026-06-11). Cualquier navegación
// vieja rebota al boot. La ruta se elimina del árbol en la Etapa 5.
export default function PinUnlockRoute() {
  return <Redirect href="/" />
}
