import { NeoSignupScreen } from '@/screens/auth/neo/neo-signup-screen'

// Crear cuenta del rediseño neumórfico (cableado 2026-07-17). La
// pantalla trae adentro RequireGuest (allowFamilylessSession) + toda la
// lógica espejada de la SignupScreen anterior — misma estructura de
// ruta, solo cambia la pantalla montada.
export default function SignupRoute() {
  return <NeoSignupScreen />
}
