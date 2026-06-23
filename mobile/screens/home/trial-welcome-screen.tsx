import { useCallback, useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
import { RequireAuth } from '@/components/guards'
import { RiseView } from '@/components/home/animated/rise-view'
import { useEntitlement } from '@/features/billing/use-entitlement'
import { freeAccessBadgeLabel } from '@/features/billing/free-access-nudge'
import { useMyProfile } from '@/features/profile/use-profile'
import { triggerHaptic } from '@/lib/haptics'
import { authTokens } from '@/theme/palette'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'

const CREAM = authTokens.surfaceCream
const DARK_GREEN = authTokens.welcomeBg
const TEXT_ON_CREAM = authTokens.welcomeBg
const TEXT_ON_CREAM_SOFT = 'rgba(14,58,38,0.6)'
const CARD_BORDER = 'rgba(14,58,38,0.14)'
const CARD_BG = 'rgba(14,58,38,0.05)'

const FEATURES = [
  'Gastos y gastos fijos sin límite',
  'Tu asistente financiero',
  'Metas de ahorro',
  'El resumen mensual de cada ciclo',
] as const

/**
 * Bienvenida al acceso completo. Sits between the onboarding-success screen and
 * Home — tanto en un alta nueva como tras "Reiniciar mi cuenta" (ambos reentran
 * por el wizard → success → acá).
 *
 * INFORMATIVA, no es un paywall: el período de acceso completo (30 días) ya está
 * activo server-side desde que existe `profiles.created_at` — el CTA no compra
 * ni dispara StoreKit, solo navega a Home. Compliance (spec §7): NUNCA
 * "prueba"/"gratis"/"trial"; copy neutro "Acceso completo · N días" vía
 * `freeAccessBadgeLabel`. Como no hay precio ni compra, NO aplica el disclosure
 * 3.1.2 de Apple (sin auto-renovación / Términos / Restaurar acá).
 *
 * El pre-prompt de notificaciones queda en onboarding-success (lo ve toda cuenta
 * nueva, también las que saltan esta pantalla). Solo mostramos esta pantalla
 * cuando `source==='trial'`: una cuenta ya cubierta (familia/comped/mvp/
 * suscripta) o con el período vencido salta directo a Home — no le anunciamos
 * días que no tiene. Lee `daysLeft` real del entitlement (no hardcodea 30) para
 * reflejar el caso de un reset a mitad de período.
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
  const entitlementQuery = useEntitlement(userId)
  const profileQuery = useMyProfile(userId)
  const snap = entitlementQuery.data

  const firstName = profileQuery.data?.display_name?.trim().split(/\s+/)[0] ?? ''

  const settled = entitlementQuery.isSuccess || entitlementQuery.isError
  const isTrial = snap?.source === 'trial'
  // Saltar a Home cuando la cuenta NO está en período de acceso completo:
  // cubierta por familia/comped/mvp/sub, período vencido (source='free'), o un
  // error del snapshot (no bloqueamos al usuario en esta pantalla).
  const shouldSkip = settled && !isTrial

  const navigateHome = useCallback(() => {
    router.replace('/(app)/(tabs)/home')
  }, [router])

  useEffect(() => {
    if (shouldSkip) navigateHome()
  }, [shouldSkip, navigateHome])

  const handleContinue = useCallback(() => {
    void triggerHaptic('selection')
    navigateHome()
  }, [navigateHome])

  // Mientras carga el entitlement, o si la cuenta no es trial (redirige a Home),
  // un lienzo crema mínimo para no flashear contenido incorrecto.
  if (!isTrial) {
    return (
      <View style={[styles.root, { backgroundColor: CREAM }]}>
        <StatusBar style="dark" />
      </View>
    )
  }

  const daysLeft = snap?.daysLeft ?? 30

  return (
    <View style={[styles.root, { backgroundColor: CREAM }]}>
      <StatusBar style="dark" />
      <View style={styles.hero}>
        <RiseView delay={100} duration={620} style={styles.center}>
          <Text style={[styles.eyebrow, { color: TEXT_ON_CREAM_SOFT }]}>
            {firstName ? `${firstName}, ya estás dentro` : 'Ya estás dentro'}
          </Text>
        </RiseView>

        <RiseView delay={180} duration={620} style={styles.center}>
          <Text style={[styles.title, { color: TEXT_ON_CREAM }]}>
            Tu hogar, sin límites
          </Text>
        </RiseView>

        <RiseView delay={260} duration={620} style={styles.accessSlot}>
          <View style={styles.accessCard}>
            <View style={styles.accessIcon}>
              <MaterialIcons name="lock-open" size={20} color={CREAM} />
            </View>
            <View style={styles.accessText}>
              <Text style={[styles.accessTitle, { color: TEXT_ON_CREAM }]}>
                Acceso completo
              </Text>
              <Text style={[styles.accessSub, { color: TEXT_ON_CREAM_SOFT }]}>
                {freeAccessBadgeLabel(daysLeft)}
              </Text>
            </View>
          </View>
        </RiseView>

        <RiseView delay={340} duration={620} style={styles.featuresSlot}>
          <View style={styles.features}>
            {FEATURES.map((feature) => (
              <View key={feature} style={styles.featureRow}>
                <MaterialIcons name="check-circle" size={20} color={DARK_GREEN} />
                <Text style={[styles.featureText, { color: TEXT_ON_CREAM }]}>
                  {feature}
                </Text>
              </View>
            ))}
          </View>
        </RiseView>
      </View>

      <RiseView delay={420} duration={620} style={styles.ctaSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Empezar"
          hitSlop={DEFAULT_HIT_SLOP}
          onPress={handleContinue}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: DARK_GREEN, opacity: pressed ? 0.92 : 1 },
          ]}
        >
          <Text style={styles.ctaLabel}>Empezar</Text>
        </Pressable>
      </RiseView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 72,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'stretch',
  },
  center: { alignItems: 'center' },
  eyebrow: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.2,
    marginBottom: 10,
    textAlign: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1.4,
    textAlign: 'center',
  },
  accessSlot: { marginTop: 36 },
  accessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  accessIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DARK_GREEN,
    flexShrink: 0,
  },
  accessText: { flex: 1 },
  accessTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  accessSub: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  featuresSlot: { marginTop: 24 },
  features: { gap: 14 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureText: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, flex: 1 },
  ctaSlot: { width: '100%' },
  cta: {
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    color: CREAM,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
})
