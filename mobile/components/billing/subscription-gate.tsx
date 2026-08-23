import { Modal, Platform, StyleSheet, View } from 'react-native'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useEntitlement } from '@/features/billing/use-entitlement'
import { useMyProfile } from '@/features/profile/use-profile'
import { OverlayHosts } from '@/components/ui/overlay-hosts'
import { BillingScreen } from '@/screens/settings/billing-screen'
import { neoTokens } from '@/theme/neo-tokens'
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
  const profile = useMyProfile(userId).data

  // Guard estructural: NUNCA bloquear mientras el usuario está en onboarding
  // (onboarding_completed_at null). Las tabs siguen montadas DEBAJO del modal de
  // onboarding (p.ej. durante "Reiniciar mi cuenta", que borra la familia y
  // re-onboardea), así que sin esto un entitlement transitoriamente bloqueado
  // montaría el paywall ENCIMA del onboarding y dejaría al usuario atrapado.
  const onboardingDone = profile?.onboarding_completed_at != null
  const blocked = !isLoading && ent != null && !ent.hasAccess && onboardingDone
  if (!blocked) return null

  // Paridad Android pendiente (auditoría 2026-08-18): el flujo de compra es
  // StoreKit-only (use-billing pasa solo `request.apple` y validate-purchase
  // solo verifica JWS de Apple), así que fuera de iOS este gate encerraría
  // al usuario en un paywall que NO puede pagar. Hasta que exista Play
  // Billing (SKUs + rama `google` + validación server), el gate solo aplica
  // en iOS — deliberadamente `!== 'ios'` y no `=== 'android'`: el preview
  // web tampoco puede comprar. OJO: esto deja Android/web SIN enforcement
  // de entitlement (no hay chequeo server-side de has_access) — cerrar
  // antes del launch de Play.
  if (Platform.OS !== 'ios') return null

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      // No descartable a propósito (onRequestClose es no-op). Con el gate
      // iOS-only el handler nunca corre —es un prop de Android—, pero el
      // contrato queda declarado para cuando el gate se extienda.
      onRequestClose={() => {}}
    >
      <View style={[styles.root, { backgroundColor: neoTokens(theme.mode).bg }]}>
        <BillingScreen lockMode />
        {/* Las salidas del gate (cerrar sesión, eliminar cuenta) preguntan
            y avisan. Los hosts de la raíz quedan DEBAJO de esta ventana
            nativa, así que el gate lleva los suyos — sin esto "Cerrar
            sesión" abría una confirmación que nadie podía ver y el botón
            se leía como muerto (regresión de cbf19915, cuando el flujo
            pasó de `Alert.alert` —diálogo del SO, siempre visible— a
            `neoConfirm`). Ver el docblock de OverlayHosts. */}
        <OverlayHosts />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({ root: { flex: 1 } })
