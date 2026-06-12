import { Modal, StyleSheet, View } from 'react-native'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useEntitlement } from '@/features/billing/use-entitlement'
import { BillingScreen } from '@/screens/settings/billing-screen'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Paywall duro. Cuando el entitlement resuelto bloquea (`has_access:false`,
 * source 'free'), monta billing-screen en `lockMode` como overlay NO
 * descartable sobre la app. La única salida es suscribirse o restaurar.
 *
 * - El acceso lo decide el SERVER (snapshot de `resolve_entitlement`),
 *   nunca el cliente.
 * - Vive en el layout de tabs, que solo existe con sesión → corre
 *   DESPUÉS del unlock (igual que ShareImportHost). Nunca antes de auth.
 * - Mientras el snapshot carga NO bloqueamos (evita un flash de paywall
 *   en el cold start antes de resolver). Default a prueba de fallos del
 *   hook = bloqueado, pero solo se aplica una vez que hay dato.
 *
 * Spec: docs/superpowers/specs/2026-06-12-apple-subscriptions-design.md §4
 */
export function SubscriptionGate() {
  const { theme } = useAppTheme()
  const userId = useAuthSession().data?.user.id
  const { data: ent, isLoading } = useEntitlement(userId)

  const blocked = !isLoading && ent != null && !ent.hasAccess
  if (!blocked) return null

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      // No descartable: en Android el back no cierra el paywall.
      onRequestClose={() => {}}
    >
      <View style={[styles.root, { backgroundColor: theme.colors.canvas }]}>
        <BillingScreen lockMode />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({ root: { flex: 1 } })
