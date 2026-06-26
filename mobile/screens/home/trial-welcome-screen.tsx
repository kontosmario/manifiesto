import { useCallback, useEffect } from 'react'
import { View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { RequireAuth } from '@/components/guards'
import { useEntitlement } from '@/features/billing/use-entitlement'
import { BillingScreen } from '@/screens/settings/billing-screen'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Bienvenida al acceso completo. Sits between the onboarding-success screen y
 * Home — tanto en un alta nueva como tras "Reiniciar mi cuenta" (ambos reentran
 * por wizard → success → aquí).
 *
 * Reusa la pantalla de planes REAL (BillingScreen) en modo bienvenida: muestra
 * los planes + el disclosure 3.1.2 de Apple + Términos/Privacidad/Restaurar, y
 * agrega un CTA primario "Empezar con N días de acceso completo" que continúa a
 * Home SIN comprar (el período libre ya está activo server-side desde
 * `profiles.created_at`). "Suscribirme por $X" queda como secundario para quien
 * quiera pagar ya.
 *
 * Solo se muestra cuando `source==='trial'` (lee `daysLeft` real, no hardcodea
 * 30). Una cuenta cubierta (familia/comped/mvp/suscripta) o con el período
 * vencido salta directo a Home; el SubscriptionGate de las tabs maneja el
 * sin-acceso. El pre-prompt de notificaciones queda en onboarding-success (lo ve
 * toda cuenta nueva, también las que saltean esta pantalla).
 */
export function TrialWelcomeScreen() {
  return (
    <RequireAuth>
      {({ userId }) => <TrialWelcomeBody userId={userId} />}
    </RequireAuth>
  )
}

function TrialWelcomeBody({ userId }: { userId: string }) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const entitlementQuery = useEntitlement(userId)
  const snap = entitlementQuery.data

  const settled = entitlementQuery.isSuccess || entitlementQuery.isError
  const isTrial = snap?.source === 'trial'
  // Saltar a Home cuando la cuenta NO está en período de acceso completo:
  // cubierta por familia/comped/mvp/sub, período vencido (source='free'), o un
  // error del snapshot (el SubscriptionGate de las tabs maneja el sin-acceso).
  const shouldSkip = settled && !isTrial

  const navigateHome = useCallback(() => {
    router.replace('/(app)/(tabs)/home')
  }, [router])

  useEffect(() => {
    if (shouldSkip) navigateHome()
  }, [shouldSkip, navigateHome])

  // Mientras carga el entitlement, o si la cuenta no es trial (redirige a Home),
  // un lienzo del color del tema para no flashear contenido incorrecto.
  if (!isTrial) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      </View>
    )
  }

  return <BillingScreen welcomeMode onContinue={navigateHome} />
}
