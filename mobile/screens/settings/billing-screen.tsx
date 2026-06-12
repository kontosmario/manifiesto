import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { FernLogo } from '@/components/auth/fern-logo'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { RiseView } from '@/components/home/animated/rise-view'
import { Screen } from '@/components/ui/screen'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import {
  BILLING_PLANS,
  type BillingCycle,
  type BillingPlan,
  type BillingPlanId,
} from '@/features/billing/billing-plans'
import { useBilling } from '@/features/billing/use-billing'
import { useEntitlement } from '@/features/billing/use-entitlement'
import { freeAccessBadgeLabel } from '@/features/billing/free-access-nudge'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/lib/legal-urls'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS, radii } from '@/theme/palette'
import { BillingCyclePicker } from '@/components/billing/billing-cycle-picker'
import { BillingPlanMorphCard } from '@/components/billing/billing-plan-morph-card'
import { BillingPriceDigits } from '@/components/billing/billing-price-digits'

const HERO_GRADIENT = ['#0F2D06', '#1F590D', '#297811'] as const
const HERO_GLOW = 'rgba(166,239,143,0.18)'
const ACCENT = '#A6EF8F'
const CREAM = '#F2EAD3'

/**
 * `lockMode`: cuando el paywall se monta como gate duro (período libre
 * vencido sin pago), oculta el botón de volver y muestra el copy de
 * bloqueo. La única salida es suscribirse o restaurar. Lo usa
 * `SubscriptionGate`.
 */
export function BillingScreen({ lockMode = false }: { lockMode?: boolean } = {}) {
  const { theme } = useAppTheme()
  const billing = useBilling()
  const userId = useAuthSession().data?.user.id
  const entitlement = useEntitlement(userId).data
  // Badge del período libre: SOLO cuando el acceso viene del trial
  // personal (un pago activo o cobertura de hogar no lo ven — spec §6.3).
  const showFreeBadge =
    !lockMode && entitlement?.source === 'trial' && (entitlement.daysLeft ?? 0) > 0

  const initialId: BillingPlanId = billing.status.activePlanId ?? 'hogar-anual'
  const [selectedId, setSelectedId] = useState<BillingPlanId>(initialId)
  const selectedPlan: BillingPlan = BILLING_PLANS[selectedId]
  const selectedCycle: BillingCycle = selectedPlan.cycle
  const isCurrentPlan = billing.status.activePlanId === selectedPlan.id

  const handleCycleChange = useCallback((cycle: BillingCycle) => {
    const nextId: BillingPlanId = cycle === 'yearly' ? 'hogar-anual' : 'hogar-mensual'
    if (nextId === selectedId) return
    setSelectedId(nextId)
  }, [selectedId])

  const handleSubscribe = useCallback(async () => {
    void triggerHaptic('selection')
    const result = await billing.purchasePlan(selectedPlan)
    if (result.ok) {
      void triggerHaptic('success')
      Alert.alert('¡Listo!', `Ya tienes el ${selectedPlan.name} activo. Disfruta tu plan.`)
    } else {
      void triggerHaptic('error')
      Alert.alert('Algo salió mal', result.reason)
    }
  }, [billing, selectedPlan])

  const handleRestorePurchases = useCallback(() => {
    void triggerHaptic('selection')
    Alert.alert(
      'Restaurar compras',
      'Si ya pagaste antes con esta cuenta de App Store o Google Play, vamos a recuperar tu suscripción automáticamente.',
    )
  }, [])

  const handleManageSubscription = useCallback(() => {
    void triggerHaptic('selection')
    const url =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions'
    void Linking.openURL(url)
  }, [])

  const ambientTone: 'aurora' | 'calm' = selectedCycle === 'yearly' ? 'aurora' : 'calm'
  const yearly = BILLING_PLANS['hogar-anual']
  const savingsBadge = yearly.savingsPercent > 0 ? `−${yearly.savingsPercent}%` : null

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      canGoBack={!lockMode}
      title={lockMode ? 'Elegí tu plan' : 'Tu plan'}
      contentContainerStyle={styles.screenContent}
    >
      <View style={styles.stack}>
        <AmbientBlobs tone={ambientTone} />

        {lockMode ? (
          <RiseView>
            <View style={styles.lockBanner}>
              <MaterialIcons name="lock-outline" size={18} color={theme.colors.text} />
              <Text style={[styles.lockBannerText, { color: theme.colors.text }]}>
                Tu mes gratis terminó. Elegí tu plan para seguir usando Manifiesto.
              </Text>
            </View>
          </RiseView>
        ) : null}

        {showFreeBadge ? (
          <RiseView>
            <FreeAccessBadge daysLeft={entitlement!.daysLeft!} />
          </RiseView>
        ) : null}

        <RiseView>
          <CompactHero status={billing.status} />
        </RiseView>

        <RiseView delay={120}>
          <BillingCyclePicker
            selected={selectedCycle}
            monthlyLabel="Mensual"
            yearlyLabel="Anual"
            savingsBadgeText={savingsBadge}
            onChange={handleCycleChange}
          />
        </RiseView>

        <RiseView delay={200}>
          <BillingPlanMorphCard plan={selectedPlan} isCurrentPlan={isCurrentPlan} />
        </RiseView>

        <RiseView delay={260}>
          <PrimaryCTA
            plan={selectedPlan}
            isCurrentPlan={isCurrentPlan}
            isPurchasing={billing.isPurchasing}
            onSubscribe={handleSubscribe}
          />
        </RiseView>

        <RiseView delay={340}>
          <TrustPills />
        </RiseView>

        <RiseView delay={420}>
          <CompactFaq />
        </RiseView>

        <RiseView delay={500}>
          <FooterMicro
            hasActivePlan={billing.status.activePlanId !== null}
            onRestore={handleRestorePurchases}
            onManage={handleManageSubscription}
          />
        </RiseView>
      </View>
    </Screen>
  )
}

// ─── Compact hero (unchanged from current) ─────────────────────────
function CompactHero({ status }: { status: ReturnType<typeof useBilling>['status'] }) {
  const isActive = status.activePlanId !== null
  const activePlan = isActive ? BILLING_PLANS[status.activePlanId!] : null
  const expiresLabel = useMemo(() => {
    if (!status.expiresAt) return null
    const date = new Date(status.expiresAt)
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  }, [status.expiresAt])

  return (
    <LinearGradient
      colors={HERO_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.heroGlow} pointerEvents="none" />
      <View style={styles.heroLogoColumn}>
        <FernLogo size={56} palette="mono-light" animate={false} />
      </View>
      <View style={styles.heroBody}>
        <View style={styles.heroPill}>
          <MaterialIcons name="auto-awesome" size={10} color="#0F2D06" />
          <Text style={styles.heroPillText} numberOfLines={1}>TU MANIFIESTO</Text>
        </View>
        <Text style={styles.heroLine} numberOfLines={2}>
          {isActive && activePlan
            ? `${activePlan.name}${expiresLabel ? `, se renueva el ${expiresLabel}` : ''}.`
            : 'Tus cuentas en orden. Solo o con quien quieras sumar.'}
        </Text>
      </View>
    </LinearGradient>
  )
}

// ─── Primary CTA with shimmer ──────────────────────────────────────
function PrimaryCTA({
  plan,
  isCurrentPlan,
  isPurchasing,
  onSubscribe,
}: {
  plan: BillingPlan
  isCurrentPlan: boolean
  isPurchasing: boolean
  onSubscribe: () => void
}) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const shimmer = useSharedValue(0)
  const [ctaWidth, setCtaWidth] = useState(0)
  const cycleSuffix = plan.cycle === 'yearly' ? '/año' : '/mes'

  const isIdleActive = !isCurrentPlan && !isPurchasing
  useEffect(() => {
    if (!isIdleActive || reduced) {
      shimmer.value = 0
      return
    }
    shimmer.value = 0
    shimmer.value = withRepeat(
      withSequence(
        // @motion-allow: decorative CTA shimmer sweep (4s cycle, 700ms travel)
        withDelay(3300, withTiming(1, { duration: 700, easing: Easing.bezier(0.4, 0, 0.2, 1) })),
        // @motion-allow: instant reset to start of next sweep
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    )
  }, [isIdleActive, reduced, shimmer])

  // Shimmer band is 80pt wide (see styles.shimmer). It enters from the
  // left edge (translateX = -80) and exits past the right edge
  // (translateX = ctaWidth). We interpolate end-points off the measured
  // CTA width so the sweep always fully traverses the button regardless
  // of device width.
  const SHIMMER_BAND = 80
  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value === 0 ? 0 : 0.6,
    transform: [
      { translateX: -SHIMMER_BAND + shimmer.value * (ctaWidth + SHIMMER_BAND) },
    ],
  }))

  if (isCurrentPlan) {
    return (
      <View
        style={[
          styles.currentCta,
          { backgroundColor: theme.colors.primarySurface, borderColor: theme.colors.primary },
        ]}
      >
        <MaterialIcons name="check-circle" size={18} color={theme.colors.primary} />
        <Text style={[styles.currentCtaText, { color: theme.colors.primary }]}>
          Ya tienes el {plan.name}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.ctaStack}>
      {/* ÚNICO CTA: suscribir. NO hay botón de "prueba gratis" — el
          período libre de 30 días es automático (no opt-in) y Apple
          rechaza la palabra "trial" sin una oferta de App Store Connect.
          El precio + período van EN el botón (requisito de compliance
          3.1.2: precio y duración prominentes). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Suscribirme al ${plan.name} por USD ${plan.priceUsd.toFixed(2)}${cycleSuffix}, renovación automática`}
        disabled={isPurchasing}
        onPress={onSubscribe}
        onLayout={(e) => setCtaWidth(e.nativeEvent.layout.width)}
        style={({ pressed }) => [
          styles.primaryCta,
          {
            backgroundColor: theme.colors.primary,
            opacity: isPurchasing ? 0.7 : pressed ? 0.92 : 1,
          },
        ]}
      >
        <Text style={styles.primaryCtaLead} numberOfLines={1}>
          Suscribirme por USD{' '}
        </Text>
        <BillingPriceDigits
          value={plan.priceUsd}
          fractionDigits={2}
          digitStyle={{
            fontSize: 15,
            fontWeight: '900',
            color: '#0F2D06',
            letterSpacing: -0.2,
            fontVariant: ['tabular-nums'],
            lineHeight: 19,
          }}
          separatorStyle={{
            fontSize: 15,
            fontWeight: '900',
            color: '#0F2D06',
            lineHeight: 19,
          }}
        />
        <Text style={styles.primaryCtaLead} numberOfLines={1}>
          {cycleSuffix}
        </Text>
        <Animated.View pointerEvents="none" style={[styles.shimmer, shimmerStyle]} />
      </Pressable>

      {/* Disclosure de auto-renovación JUNTO al CTA (requisito 3.1.2). */}
      <Text style={[styles.ctaReassurance, { color: theme.colors.textMuted }]}>
        Se renueva automáticamente {plan.cycle === 'yearly' ? 'cada año' : 'cada mes'} hasta que canceles. Cancelás desde Ajustes de iOS cuando quieras.
      </Text>
    </View>
  )
}

// ─── Trust pills (unchanged from current) ──────────────────────────
function TrustPills() {
  const { theme } = useAppTheme()
  const items = ['Pago seguro', 'Sin permanencia', 'Tus datos protegidos'] as const
  return (
    <View style={styles.pillsRow}>
      {items.map((item) => (
        <View
          key={item}
          style={[
            styles.pill,
            {
              backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
              borderColor: theme.colors.line,
            },
          ]}
        >
          <View style={[styles.pillDot, { backgroundColor: theme.colors.primary }]} />
          <Text
            style={[styles.pillText, { color: theme.colors.textMuted }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.92}
          >
            {item}
          </Text>
        </View>
      ))}
    </View>
  )
}

// ─── FAQ (unchanged from current) ──────────────────────────────────
const FAQ_PRIMARY: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: '¿Puedo cambiar de plan más adelante?',
    a: 'Sí. Cambias desde aquí o desde tu suscripción en App Store o Google Play. Si pasas del Mensual al Anual, solo pagas la diferencia.',
  },
  {
    q: '¿Qué pasa si dejo de pagar?',
    a: 'Sigues pudiendo ver todo tu historial, pero no podrás agregar gastos nuevos hasta que reactives el plan. Tus datos quedan guardados, no se borran.',
  },
  {
    q: '¿Por qué tiene un costo?',
    a: 'Mantener la app cuesta dinero (servidores, mejoras, soporte). Preferimos cobrar una suscripción justa antes que vender tus datos a terceros.',
  },
]
const FAQ_SECONDARY: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: '¿Y si necesito más cuentas?',
    a: 'Si en el Mensual ya usas las 2, puedes pasar al Anual con un toque desde aquí, sin perder ningún dato.',
  },
  {
    q: '¿Cómo funciona la prueba gratis?',
    a: 'Tienes 14 días para probar todo sin pagar y sin pedir tarjeta. Te avisaremos por correo y dentro de la app antes de cualquier cobro.',
  },
]

function CompactFaq() {
  const { theme } = useAppTheme()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const items = showAll ? [...FAQ_PRIMARY, ...FAQ_SECONDARY] : FAQ_PRIMARY

  return (
    <View style={styles.faqStack}>
      <Text style={[styles.faqEyebrow, { color: theme.colors.textMuted }]}>PREGUNTAS COMUNES</Text>
      <View
        style={[
          styles.faqCard,
          {
            backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
            borderColor: theme.colors.line,
          },
        ]}
      >
        {items.map((item, idx) => {
          const isOpen = expanded === item.q
          const isLast = idx === items.length - 1 && !showAll
          return (
            <View
              key={item.q}
              style={[
                styles.faqRow,
                !isLast && {
                  borderBottomColor: theme.colors.line,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                onPress={() => {
                  void triggerHaptic('selection')
                  setExpanded(isOpen ? null : item.q)
                }}
                style={styles.faqHead}
                hitSlop={4}
              >
                <Text style={[styles.faqQ, { color: theme.colors.text }]}>{item.q}</Text>
                <MaterialIcons name={isOpen ? 'remove' : 'add'} size={18} color={theme.colors.textMuted} />
              </Pressable>
              {isOpen ? (
                <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
                  <Text style={[styles.faqA, { color: theme.colors.textMuted }]}>{item.a}</Text>
                </Animated.View>
              ) : null}
            </View>
          )
        })}
      </View>
      {!showAll ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void triggerHaptic('selection')
            setShowAll(true)
          }}
          style={styles.faqMore}
          hitSlop={6}
        >
          <Text style={[styles.faqMoreText, { color: theme.colors.primary }]}>Ver más preguntas</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

// ─── Footer micro (unchanged from current) ─────────────────────────
function FooterMicro({
  hasActivePlan,
  onRestore,
  onManage,
}: {
  hasActivePlan: boolean
  onRestore: () => void
  onManage: () => void
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.footerStack}>
      <View style={styles.footerLinks}>
        {/* Restaurar compras — OBLIGATORIO y visible (Apple 3.1.1). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restaurar compras"
          onPress={onRestore}
          hitSlop={6}
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.footerLinkText, { color: theme.colors.textMuted }]}>Restaurar compras</Text>
        </Pressable>
        {hasActivePlan ? (
          <>
            <View style={[styles.footerSep, { backgroundColor: theme.colors.line }]} />
            <Pressable
              accessibilityRole="button"
              onPress={onManage}
              hitSlop={6}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.footerLinkText, { color: theme.colors.textMuted }]}>Ver mi suscripción</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      {/* Links a Términos (EULA) + Privacidad — OBLIGATORIOS en el
          paywall, no solo en la web (Apple 3.1.2). Funcionales. */}
      <View style={styles.footerLinks}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Términos de uso"
          onPress={() => void Linking.openURL(TERMS_OF_SERVICE_URL)}
          hitSlop={6}
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.footerLinkText, { color: theme.colors.textMuted }]}>Términos de uso</Text>
        </Pressable>
        <View style={[styles.footerSep, { backgroundColor: theme.colors.line }]} />
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Política de privacidad"
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          hitSlop={6}
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.footerLinkText, { color: theme.colors.textMuted }]}>Privacidad</Text>
        </Pressable>
      </View>

      <Text style={[styles.legal, { color: theme.colors.textSoft }]}>
        La suscripción se renueva automáticamente al final de cada período hasta que la canceles desde Ajustes de iOS. Los precios pueden variar según tu país.
      </Text>
    </View>
  )
}

// ─── Badge pasivo del período libre (solo source==='trial') ────────
function FreeAccessBadge({ daysLeft }: { daysLeft: number }) {
  const { theme } = useAppTheme()
  return (
    <View
      style={[
        styles.freeAccessBadge,
        {
          backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <MaterialIcons name="lock-open" size={16} color={theme.colors.primary} />
      <Text style={[styles.freeAccessText, { color: theme.colors.text }]}>
        {freeAccessBadgeLabel(daysLeft)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screenContent: { paddingTop: 4 },
  stack: { gap: 16, position: 'relative' },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(127,127,127,0.25)',
  },
  lockBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  freeAccessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  freeAccessText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: 'rgba(166,239,143,0.22)',
    overflow: 'hidden',
  },
  heroGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: HERO_GLOW,
    opacity: 0.35,
    transform: [{ translateY: -60 }, { scale: 1.4 }],
    borderRadius: 999,
  },
  // Logo column — no frame, the silhouette is its own shape. Width
  // matches the FernLogo `size` prop so the column hugs the artwork.
  heroLogoColumn: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: { flex: 1, gap: 8 },
  heroPill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  heroPillText: {
    flexShrink: 1,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: '#0F2D06',
  },
  heroLine: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    color: CREAM,
    letterSpacing: -0.15,
    lineHeight: 20,
  },

  ctaStack: { gap: 10 },
  primaryCta: {
    minHeight: 56,
    borderRadius: radii.lg,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
    shadowColor: '#0F2D06',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
  ctaLabel: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  primaryCtaLead: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F2D06',
    letterSpacing: -0.2,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: 'rgba(255,255,255,0.55)',
    transform: [{ skewX: '-20deg' }],
  },
  secondaryCta: {
    minHeight: 52,
    borderRadius: radii.lg,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryCtaLead: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  ctaReassurance: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.05,
    paddingTop: 2,
  },
  currentCta: {
    minHeight: 48,
    borderRadius: radii.lg,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
  },
  currentCtaText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.1 },

  pillsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  pill: {
    flex: 1,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillDot: { width: 5, height: 5, borderRadius: 999 },
  pillText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
    textAlign: 'center',
  },

  faqStack: { gap: 6 },
  faqEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, paddingHorizontal: 4 },
  faqCard: { borderRadius: radii.lg, borderWidth: 1, overflow: 'hidden' },
  faqRow: { paddingHorizontal: 14, paddingVertical: 11 },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  faqQ: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18, letterSpacing: -0.1 },
  faqA: { fontSize: 12, lineHeight: 17, fontWeight: '500', paddingTop: 6, paddingRight: 22 },
  faqMore: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  faqMoreText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.1 },

  footerStack: { gap: 8, marginTop: 4 },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  footerSep: { width: 3, height: 3, borderRadius: 999 },
  footerLinkText: { fontSize: 12, fontWeight: '700' },
  legal: { fontSize: 10, lineHeight: 14, textAlign: 'center', paddingHorizontal: 12 },
})
