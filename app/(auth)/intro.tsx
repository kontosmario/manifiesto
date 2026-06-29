import { useCallback } from 'react'
import { useRouter, type Href } from 'expo-router'
import { RequireGuest } from '@/components/guards'
import { IntroScreen } from '@/screens/auth/intro/intro-screen'
import { markIntroSeen } from '@/features/onboarding-intro/intro-seen'

// El signup vive en /(auth)/signup; el cast mantiene la ruta desacoplada
// del tipo generado (mismo patrón que welcome.tsx).
const SIGNUP_HREF = '/(auth)/signup' as unknown as Href

/**
 * Pre-auth onboarding intro (5 slides). Lo monta el auth-flow machine como
 * destino del estado `guest` cuando NO hay sesión y el intro todavía no fue
 * visto (ver auth-flow-machine PROBES_RESOLVED). Ambos CTA marcan el intro
 * como visto ANTES de navegar para que el próximo cold-start vaya directo a
 * welcome/login (el await evita la carrera: si la app muere entre el push y
 * el write, el flag no quedaría persistido y el intro se re-mostraría).
 *
 * Envuelto en RequireGuest (igual que login/signup): si un usuario YA logueado
 * llega acá por un deep-link, lo rebota a `/` en vez de mostrarle el pre-auth.
 */
export default function IntroRoute() {
  const router = useRouter()

  const onCreate = useCallback(async () => {
    await markIntroSeen()
    router.push(SIGNUP_HREF)
  }, [router])

  const onLogin = useCallback(async () => {
    await markIntroSeen()
    router.push('/(auth)/login')
  }, [router])

  return (
    <RequireGuest allowFamilylessSession>
      <IntroScreen onCreate={onCreate} onLogin={onLogin} />
    </RequireGuest>
  )
}
