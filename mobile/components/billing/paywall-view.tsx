import { memo, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'
import { getStateTokens } from '@/theme/state-tokens'
import { RiseView } from '@/components/home/animated/rise-view'
import { AppButton } from '@/components/ui/button'
import { BrandLockup } from '@/components/billing/brand-lockup'
import { PlanTiles } from '@/components/billing/plan-tiles'
import { SavingsRibbon } from '@/components/billing/savings-ribbon'
import { FreePeriodBanner } from '@/components/billing/free-period-banner'
import {
  BILLING_PLANS,
  type BillingPlan,
  type BillingPlanId,
} from '@/features/billing/billing-plans'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/lib/legal-urls'
import type { EntitlementSnapshot } from '@/features/billing/entitlement-snapshot'

/**
 * Paywall (Estado A). Lo ven los no-suscriptos. Si están en período libre
 * (source==='trial') muestra el banner "Acceso completo · N días" — NUNCA
 * lenguaje de "prueba/gratis" en el CTA (el botón cobra de inmediato; no hay
 * intro offer de StoreKit que disclosear). `lockMode` = gate de bloqueo.
 */
export interface PaywallViewProps {
  snap: EntitlementSnapshot
  lockMode?: boolean
  isPurchasing: boolean
  onPurchase: (plan: BillingPlan) => void
  onRestore: () => void
  /** Solo en lockMode: salidas para que el usuario no quede atrapado en el
   *  paywall duro si no quiere suscribirse. Visibles ÚNICAMENTE sin membresía
   *  paga y con el período de prueba vencido — que es exactamente cuando se
   *  monta el lockMode (has_access=false). */
  onLogout?: () => void
  onDeleteAccount?: () => void
  productPrices?: Record<string, string>
  /** Modo bienvenida post-onboarding (solo en período libre): agrega un CTA
   *  primario "Empezar con N días de acceso completo" que continúa a Home sin
   *  comprar, y baja "Suscribirme" a secundario. El disclosure 3.1.2 sigue
   *  visible (aplica al botón de suscripción, que sigue presente). */
  onContinueFree?: () => void
  continueLabel?: string
}

export const PaywallView = memo(function PaywallView({
  snap,
  lockMode = false,
  isPurchasing,
  onPurchase,
  onRestore,
  onLogout,
  onDeleteAccount,
  productPrices,
  onContinueFree,
  continueLabel,
}: PaywallViewProps) {
  const { theme } = useAppTheme()
  const [selected, setSelected] = useState<BillingPlanId>('hogar-anual')
  const plan = BILLING_PLANS[selected]
  const priceText = `$${plan.priceUsd.toFixed(2)}${plan.cycle === 'yearly' ? '/año' : '/mes'}`
  const inFreePeriod = snap.source === 'trial' && snap.daysLeft != null
  const caution = getStateTokens('caution', theme)
  const linkStyle = [theme.typography.caption, { color: theme.colors.textMuted }]

  return (
    <View style={styles.root}>
      {lockMode ? (
        <RiseView delay={0}>
          <View style={[styles.lockChip, { backgroundColor: caution.bg }]}>
            <MaterialIcons name="lock" size={12} color={caution.fg} />
            <Text style={[styles.lockText, { color: caution.fg }]}>
              ACCESO PAUSADO
            </Text>
          </View>
        </RiseView>
      ) : null}

      {inFreePeriod ? (
        <RiseView delay={20}>
          <FreePeriodBanner daysLeft={snap.daysLeft as number} />
        </RiseView>
      ) : null}

      <RiseView delay={40}>
        <BrandLockup />
      </RiseView>

      <RiseView delay={60}>
        <Text style={[styles.headline, { color: theme.colors.text }]}>
          {lockMode ? 'Tu acceso\nestá pausado.' : 'Todo tu hogar,\nen una cuenta.'}
        </Text>
      </RiseView>

      <RiseView delay={80}>
        <PlanTiles
          selected={selected}
          onSelect={setSelected}
          productPrices={productPrices}
        />
      </RiseView>

      <RiseView delay={100}>
        <SavingsRibbon
          savingsUsd={plan.savingsUsd}
          savingsPercent={plan.savingsPercent}
        />
      </RiseView>

      <RiseView delay={120}>
        <View style={styles.features}>
          {plan.highlights.slice(0, 3).map((h, i) => (
            <View key={i} style={styles.feat}>
              <MaterialIcons name="check" size={14} color={theme.colors.primary} />
              <Text
                style={[theme.typography.bodySmall, { color: theme.colors.text, flex: 1 }]}
              >
                {h}
              </Text>
            </View>
          ))}
        </View>
      </RiseView>

      <RiseView delay={140}>
        {onContinueFree && inFreePeriod ? (
          <View style={styles.ctaStack}>
            <AppButton
              label={continueLabel ?? 'Empezar'}
              variant="primary"
              fullWidth
              onPress={onContinueFree}
            />
            <AppButton
              label={`Suscribirme por ${priceText}`}
              variant="secondary"
              fullWidth
              loading={isPurchasing}
              onPress={() => onPurchase(plan)}
            />
          </View>
        ) : (
          <AppButton
            label={`Suscribirme por ${priceText}`}
            variant="primary"
            fullWidth
            loading={isPurchasing}
            onPress={() => onPurchase(plan)}
          />
        )}
        {/* Disclosure de auto-renovación EXIGIDO por Apple (Guideline 3.1.2):
            cargo a Apple ID al confirmar · renovación salvo cancelación 24hs
            antes · gestión/cancelación desde Ajustes de la cuenta. Visible
            ANTES de comprar. No achicar por debajo de caption (legibilidad). */}
        <Text
          style={[
            theme.typography.caption,
            styles.disclosure,
            { color: theme.colors.textMuted },
          ]}
        >
          El pago se cargará a tu cuenta de Apple ID al confirmar la compra. La
          suscripción se renueva automáticamente al mismo precio salvo que la
          canceles al menos 24 horas antes de que termine el período actual; el
          cargo de renovación se hace dentro de esas 24 horas. Podés gestionarla
          o cancelarla cuando quieras desde los Ajustes de tu cuenta en la App
          Store.
        </Text>
      </RiseView>

      <RiseView delay={160}>
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restaurar compras"
            hitSlop={8}
            onPress={onRestore}
          >
            <Text style={linkStyle}>Restaurar compras</Text>
          </Pressable>
          <Text style={linkStyle}> · </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Términos de uso"
            hitSlop={8}
            onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}
          >
            <Text style={linkStyle}>Términos</Text>
          </Pressable>
          <Text style={linkStyle}> · </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Política de privacidad"
            hitSlop={8}
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
          >
            <Text style={linkStyle}>Privacidad</Text>
          </Pressable>
        </View>
        {/* Salidas del gate duro: sin esto el usuario con trial vencido que no
            quiere pagar queda atrapado (no llega a Ajustes). Solo en lockMode
            (= sin membresía + prueba vencida). Eliminar cuenta cumple además la
            Guideline 5.1.1(v) de Apple (baja accesible in-app). */}
        {lockMode && (onLogout || onDeleteAccount) ? (
          <View style={styles.escapeRow}>
            {onLogout ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar sesión"
                hitSlop={8}
                onPress={onLogout}
                style={({ pressed }) => [
                  styles.escapeAction,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <MaterialIcons name="logout" size={15} color={theme.colors.textMuted} />
                <Text
                  style={[
                    theme.typography.bodySmall,
                    { color: theme.colors.textMuted, fontWeight: '600' },
                  ]}
                >
                  Cerrar sesión
                </Text>
              </Pressable>
            ) : null}
            {onLogout && onDeleteAccount ? (
              <Text style={[theme.typography.bodySmall, { color: theme.colors.line }]}>
                |
              </Text>
            ) : null}
            {onDeleteAccount ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Eliminar cuenta"
                hitSlop={8}
                onPress={onDeleteAccount}
                style={({ pressed }) => [
                  styles.escapeAction,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <MaterialIcons
                  name="delete-outline"
                  size={15}
                  color={theme.colors.danger}
                />
                <Text
                  style={[
                    theme.typography.bodySmall,
                    { color: theme.colors.danger, fontWeight: '600' },
                  ]}
                >
                  Eliminar cuenta
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </RiseView>
    </View>
  )
})

const styles = StyleSheet.create({
  root: { gap: 14 },
  ctaStack: { gap: 10 },
  lockChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  lockText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  headline: { fontSize: 23, fontWeight: '900', letterSpacing: -0.9, lineHeight: 26 },
  features: { gap: 7 },
  feat: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disclosure: { textAlign: 'center', marginTop: 10, lineHeight: 16 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  escapeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  escapeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
})
