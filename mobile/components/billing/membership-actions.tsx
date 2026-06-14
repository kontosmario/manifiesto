import { memo } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { useAppTheme } from '@/theme/theme-provider'
import type { MembershipVariant } from '@/features/billing/membership-state'

/**
 * Acciones del hero "Mi suscripción" (región `.acts6` del mockup v2).
 * Columna de botones + link de restaurar. La variante decide si arriba
 * aparece un CTA primario (reactivar / arreglar pago); "Cambiar de plan"
 * y "Administrar en App Store" están siempre.
 */
export interface MembershipActionsProps {
  variant: MembershipVariant
  onChangePlan(): void
  onRestore(): void
}

// Path compliant: Apple exige que cancelar/gestionar la suscripción se haga
// por el sistema (App Store), no dentro de la app. Abrimos el deep-link
// oficial de suscripciones en vez de cualquier flujo propio.
const openManage = () => {
  void Linking.openURL('https://apps.apple.com/account/subscriptions')
}

export const MembershipActions = memo(function MembershipActions({
  variant,
  onChangePlan,
  onRestore,
}: MembershipActionsProps) {
  const { theme } = useAppTheme()

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {/* CTA primario contextual según el estado del entitlement. */}
      {variant.primaryAction === 'reactivate' ? (
        <AppButton variant="primary" label="Reactivar" fullWidth onPress={onChangePlan} />
      ) : variant.primaryAction === 'fixPayment' ? (
        <AppButton
          variant="primary"
          label="Actualizar método de pago en App Store"
          fullWidth
          onPress={openManage}
        />
      ) : null}

      <AppButton
        variant="secondary"
        label="Cambiar de plan"
        fullWidth
        onPress={onChangePlan}
      />
      <AppButton
        variant="ghost"
        label="Administrar o cancelar en App Store"
        fullWidth
        onPress={openManage}
      />

      {/* Link discreto — recupera compras previas sin volver a pagar. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Restaurar compras"
        hitSlop={8}
        onPress={onRestore}
        style={styles.restoreHit}
      >
        <Text style={[theme.typography.bodySmall, styles.restore, { color: theme.colors.textMuted }]}>
          Restaurar compras
        </Text>
      </Pressable>
    </View>
  )
})

const styles = StyleSheet.create({
  restoreHit: { alignSelf: 'center', paddingVertical: 6 },
  restore: { fontWeight: '700', textAlign: 'center' },
})
