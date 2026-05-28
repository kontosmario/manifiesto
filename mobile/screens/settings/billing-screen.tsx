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
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
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
import { motionDurations } from '@/lib/motion/tokens'
import {
  BILLING_PLANS,
  BILLING_TRIAL_DAYS,
  type BillingPlan,
  type BillingPlanId,
} from '@/features/billing/billing-plans'
import { useBilling } from '@/features/billing/use-billing'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS, radii } from '@/theme/palette'

// ─── Tokens premium dark forest, alineados con Asesor card ───
const HERO_GRADIENT = ['#0F2D06', '#1F590D', '#297811'] as const
const HERO_GLOW = 'rgba(166,239,143,0.18)'
const ACCENT = '#A6EF8F' // primary-300
const CREAM = '#F2EAD3'

export function BillingScreen() {
  const { theme } = useAppTheme()
  const billing = useBilling()
  const monthly = BILLING_PLANS['hogar-mensual']
  const yearly = BILLING_PLANS['hogar-anual']

  // El plan activo manda como inicial; si no hay, default al recomendado.
  const initialId: BillingPlanId =
    billing.status.activePlanId ?? 'hogar-anual'
  const [selectedId, setSelectedId] = useState<BillingPlanId>(initialId)
  const selectedPlan =
    selectedId === 'hogar-anual' ? yearly : monthly
  const isCurrentPlan = billing.status.activePlanId === selectedPlan.id

  const handleSelect = useCallback((id: BillingPlanId) => {
    if (id === selectedId) return
    void triggerHaptic('selection')
    setSelectedId(id)
  }, [selectedId])

  const handleSubscribe = useCallback(async () => {
    void triggerHaptic('selection')
    const result = await billing.purchasePlan(selectedPlan)
    if (result.ok) {
      void triggerHaptic('success')
      Alert.alert(
        '¡Listo!',
        `Ya tienes el ${selectedPlan.name} activo. Disfruta tu plan.`,
      )
    } else {
      void triggerHaptic('error')
      Alert.alert('Algo salió mal', result.reason)
    }
  }, [billing, selectedPlan])

  const handleStartTrial = useCallback(async () => {
    void triggerHaptic('selection')
    await billing.startFreeTrial(selectedPlan)
    void triggerHaptic('success')
    Alert.alert(
      `${BILLING_TRIAL_DAYS} días gratis`,
      'Prueba Manifiesto sin tarjeta. Te avisaremos antes de cualquier cobro.',
    )
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

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      canGoBack
      title="Tu plan"
      contentContainerStyle={styles.screenContent}
    >
      <View style={styles.stack}>
        <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />

        <RiseView>
          <CompactHero status={billing.status} />
        </RiseView>

        <RiseView delay={120}>
          <PlanGrid
            monthly={monthly}
            yearly={yearly}
            selectedId={selectedId}
            activePlanId={billing.status.activePlanId}
            onSelect={handleSelect}
          />
        </RiseView>

        <RiseView delay={200}>
          <PlanDetail selectedPlan={selectedPlan} />
        </RiseView>

        <RiseView delay={260}>
          <PrimaryCTA
            plan={selectedPlan}
            isCurrentPlan={isCurrentPlan}
            isPurchasing={billing.isPurchasing}
            onSubscribe={handleSubscribe}
            onStartTrial={handleStartTrial}
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

// ─── Compact hero ──────────────────────────────────────────────────
function CompactHero({
  status,
}: {
  status: ReturnType<typeof useBilling>['status']
}) {
  const reduced = useReducedMotion()
  const isActive = status.activePlanId !== null
  const activePlan = isActive ? BILLING_PLANS[status.activePlanId!] : null
  const expiresLabel = useMemo(() => {
    if (!status.expiresAt) return null
    const date = new Date(status.expiresAt)
    return date.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
    })
  }, [status.expiresAt])

  return (
    <LinearGradient
      colors={HERO_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.heroGlow} pointerEvents="none" />
      <View style={styles.heroLeft}>
        <View style={styles.heroLogoBadge}>
          <FernLogo
            size={36}
            palette="mono-light"
            animate={!reduced}
            iconMode
          />
        </View>
      </View>
      <View style={styles.heroBody}>
        <View style={styles.heroPill}>
          <MaterialIcons name="auto-awesome" size={10} color="#0F2D06" />
          <Text style={styles.heroPillText} numberOfLines={1}>
            PLAN DEL HOGAR
          </Text>
        </View>
        <Text style={styles.heroLine} numberOfLines={2}>
          {isActive && activePlan
            ? `${activePlan.name}${expiresLabel ? `, se renueva el ${expiresLabel}` : ''}.`
            : 'Lleven juntos las cuentas de la casa.'}
        </Text>
      </View>
    </LinearGradient>
  )
}

// ─── Plan grid (replaces toggle + plan card + comparison) ──────────
function PlanGrid({
  monthly,
  yearly,
  selectedId,
  activePlanId,
  onSelect,
}: {
  monthly: BillingPlan
  yearly: BillingPlan
  selectedId: BillingPlanId
  activePlanId: BillingPlanId | null
  onSelect: (id: BillingPlanId) => void
}) {
  return (
    <View style={styles.planGrid}>
      <PlanTile
        plan={monthly}
        selected={selectedId === monthly.id}
        isCurrent={activePlanId === monthly.id}
        onPress={() => onSelect(monthly.id)}
      />
      <PlanTile
        plan={yearly}
        selected={selectedId === yearly.id}
        isCurrent={activePlanId === yearly.id}
        onPress={() => onSelect(yearly.id)}
      />
    </View>
  )
}

function PlanTile({
  plan,
  selected,
  isCurrent,
  onPress,
}: {
  plan: BillingPlan
  selected: boolean
  isCurrent: boolean
  onPress: () => void
}) {
  const { theme } = useAppTheme()
  const progress = useSharedValue(selected ? 1 : 0)
  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, { duration: motionDurations.standard })
  }, [selected, progress])

  const surfaceStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.012 }],
    shadowOpacity: 0.05 + progress.value * 0.13,
  }))

  const cycleLabel = plan.cycle === 'yearly' ? 'ANUAL' : 'MENSUAL'
  const priceMain = plan.priceUsd.toFixed(2)
  const cycleSuffix = plan.cycle === 'yearly' ? '/año' : '/mes'

  return (
    <Animated.View style={[styles.tileWrap, surfaceStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${plan.name}, ${plan.priceUsd} dólares ${cycleSuffix}, hasta ${plan.memberCap} cuentas`}
        onPress={onPress}
        style={[
          styles.tile,
          {
            backgroundColor: selected
              ? theme.colors.creamCard
              : theme.colors.creamSoft,
            borderColor: selected ? theme.colors.primary : theme.colors.line,
            borderWidth: selected ? 1.6 : 1,
          },
        ]}
      >
        {plan.recommended ? (
          <View
            style={[
              styles.savingsBadge,
              {
                backgroundColor: theme.colors.primary,
              },
            ]}
          >
            <Text style={styles.savingsBadgeText}>−{plan.savingsPercent}%</Text>
          </View>
        ) : null}

        <Text
          style={[
            styles.tileEyebrow,
            {
              color: selected ? theme.colors.primary : theme.colors.textMuted,
            },
          ]}
        >
          {cycleLabel}
        </Text>

        <View style={styles.tilePriceBlock}>
          <View style={styles.tilePriceRow}>
            <Text style={[styles.tileCurrency, { color: theme.colors.textMuted }]}>
              USD
            </Text>
            <Text
              style={[styles.tilePrice, { color: theme.colors.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {priceMain}
            </Text>
            <Text style={[styles.tileCycleSuffix, { color: theme.colors.textMuted }]}>
              {cycleSuffix}
            </Text>
          </View>
          <Text
            style={[styles.tileEffective, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {plan.cycle === 'yearly' ? 'Como USD 3.33/mes' : ' '}
          </Text>
        </View>

        <View
          style={[
            styles.tileDivider,
            { backgroundColor: theme.colors.line },
          ]}
        />

        <View style={styles.tileCapRow}>
          <MaterialIcons
            name="group"
            size={14}
            color={selected ? theme.colors.primary : theme.colors.textMuted}
          />
          <Text
            style={[styles.tileCapText, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            Hasta {plan.memberCap} personas
          </Text>
        </View>
        <Text
          style={[styles.tileCapSub, { color: theme.colors.textMuted }]}
          numberOfLines={2}
        >
          {plan.memberCap === 4
            ? 'Suma a abuelos o hijos.'
            : 'Para ti y una persona más.'}
        </Text>

        <View style={styles.tileFooter}>
          <SelectIndicator selected={selected} />
          {isCurrent ? (
            <Text
              style={[styles.tileCurrent, { color: theme.colors.primary }]}
              numberOfLines={1}
            >
              Tu plan
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  )
}

function SelectIndicator({ selected }: { selected: boolean }) {
  const { theme } = useAppTheme()
  return (
    <View
      style={[
        styles.selectDot,
        {
          backgroundColor: selected ? theme.colors.primary : 'transparent',
          borderColor: selected ? theme.colors.primary : theme.colors.borderStrong,
        },
      ]}
    >
      {selected ? (
        <MaterialIcons name="check" size={11} color="#0F2D06" />
      ) : null}
    </View>
  )
}

// ─── Plan detail (highlights del plan seleccionado, diff anual) ───
// annualOnly se computa una sola vez: items que están en annual pero no en monthly.
const _monthly = BILLING_PLANS['hogar-mensual']
const _annual = BILLING_PLANS['hogar-anual']
const ANNUAL_ONLY_SET = new Set(
  _annual.highlights.filter((h) => !(_monthly.highlights as readonly string[]).includes(h)),
)

function PlanDetail({ selectedPlan }: { selectedPlan: BillingPlan }) {
  const { theme } = useAppTheme()
  const isAnnual = selectedPlan.cycle === 'yearly'

  return (
    <View
      style={[
        styles.detailWrap,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      {/* Header: nombre + tagline */}
      <View style={styles.detailHeader}>
        <Text style={[styles.detailName, { color: theme.colors.text }]}>
          {selectedPlan.name}
        </Text>
        <Text style={[styles.detailTagline, { color: theme.colors.textMuted }]}>
          {selectedPlan.tagline}
        </Text>
      </View>

      <View
        style={[styles.detailDivider, { backgroundColor: theme.colors.line }]}
      />

      {/* Eyebrow "Qué incluye" */}
      <Text style={[styles.detailEyebrow, { color: theme.colors.textMuted }]}>
        QUÉ INCLUYE
      </Text>

      {/* Checklist */}
      <View style={styles.detailList}>
        {selectedPlan.highlights.map((feature) => {
          const isExclusive = isAnnual && ANNUAL_ONLY_SET.has(feature)
          return (
            <View key={feature} style={styles.detailRow}>
              <MaterialIcons
                name="check-circle"
                size={16}
                color={theme.colors.primary}
                style={styles.detailCheckIcon}
              />
              <Text
                style={[styles.detailFeatureText, { color: theme.colors.text }]}
              >
                {feature}
              </Text>
              {isExclusive ? (
                <View
                  style={[
                    styles.exclusivePill,
                    { backgroundColor: theme.colors.primarySurface, borderColor: theme.colors.primary },
                  ]}
                >
                  <Text
                    style={[styles.exclusivePillText, { color: theme.colors.primary }]}
                  >
                    Solo en Anual
                  </Text>
                </View>
              ) : null}
            </View>
          )
        })}
      </View>

      {/* Savings callout (solo plan anual) */}
      {isAnnual && selectedPlan.savingsUsd > 0 ? (
        <View
          style={[
            styles.savingsCallout,
            {
              backgroundColor: theme.colors.primarySurface,
              borderColor: theme.colors.primary,
            },
          ]}
        >
          <MaterialIcons
            name="savings"
            size={14}
            color={theme.colors.primary}
          />
          <Text
            style={[styles.savingsCalloutText, { color: theme.colors.text }]}
          >
            {'Ahorrás USD '}
            {selectedPlan.savingsUsd.toFixed(2)}
            {' al año'}
            {selectedPlan.effectiveCopy
              ? ` · ${selectedPlan.effectiveCopy.toLowerCase()}`
              : ''}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

// ─── Primary CTA (dinámica según plan seleccionado) ────────────────
function PrimaryCTA({
  plan,
  isCurrentPlan,
  isPurchasing,
  onSubscribe,
  onStartTrial,
}: {
  plan: BillingPlan
  isCurrentPlan: boolean
  isPurchasing: boolean
  onSubscribe: () => void
  onStartTrial: () => void
}) {
  const { theme } = useAppTheme()
  const priceLabel = `USD ${plan.priceUsd.toFixed(2)}${plan.cycle === 'yearly' ? '/año' : '/mes'}`

  if (isCurrentPlan) {
    return (
      <View
        style={[
          styles.currentCta,
          {
            backgroundColor: theme.colors.primarySurface,
            borderColor: theme.colors.primary,
          },
        ]}
      >
        <MaterialIcons
          name="check-circle"
          size={18}
          color={theme.colors.primary}
        />
        <Text style={[styles.currentCtaText, { color: theme.colors.primary }]}>
          Ya tienes el {plan.name}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.ctaStack}>
      <Pressable
        accessibilityRole="button"
        disabled={isPurchasing}
        onPress={onSubscribe}
        style={({ pressed }) => [
          styles.primaryCta,
          {
            backgroundColor: theme.colors.primary,
            opacity: isPurchasing ? 0.7 : pressed ? 0.92 : 1,
          },
        ]}
      >
        <Text style={styles.primaryCtaText} numberOfLines={1}>
          {isPurchasing ? 'Un momento…' : `Empezar por ${priceLabel}`}
        </Text>
        {!isPurchasing ? (
          <MaterialIcons name="arrow-forward" size={18} color="#0F2D06" />
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={isPurchasing}
        onPress={onStartTrial}
        style={styles.trialLink}
        hitSlop={6}
      >
        <Text style={[styles.trialLinkText, { color: theme.colors.textMuted }]}>
          O prueba {BILLING_TRIAL_DAYS} días gratis, sin tarjeta
        </Text>
      </Pressable>
    </View>
  )
}

// ─── Trust pills (single line, no card) ────────────────────────────
function TrustPills() {
  const { theme } = useAppTheme()
  const items = [
    'Pago seguro',
    'Sin permanencia',
    'Tus datos protegidos',
  ] as const
  return (
    <View style={styles.pillsRow}>
      {items.map((item) => (
        <View
          key={item}
          style={[
            styles.pill,
            {
              backgroundColor: theme.colors.creamCard,
              borderColor: theme.colors.line,
            },
          ]}
        >
          <View
            style={[
              styles.pillDot,
              { backgroundColor: theme.colors.primary },
            ]}
          />
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

// ─── Compact FAQ (3 visibles, resto colapsado bajo "Ver más") ─────
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
    q: '¿Por qué tiene un costo si es para familias?',
    a: 'Mantener la app cuesta dinero (servidores, mejoras, soporte). Preferimos cobrar una suscripción justa antes que vender los datos de las familias a terceros.',
  },
]
const FAQ_SECONDARY: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: '¿Y si somos más personas que el límite?',
    a: 'Si en el Mensual son más de 2, puedes pasar al Anual con un toque desde aquí, sin perder ningún dato.',
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
      <Text style={[styles.faqEyebrow, { color: theme.colors.textMuted }]}>
        PREGUNTAS COMUNES
      </Text>
      <View
        style={[
          styles.faqCard,
          {
            backgroundColor: theme.colors.creamCard,
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
                <Text style={[styles.faqQ, { color: theme.colors.text }]}>
                  {item.q}
                </Text>
                <MaterialIcons
                  name={isOpen ? 'remove' : 'add'}
                  size={18}
                  color={theme.colors.textMuted}
                />
              </Pressable>
              {isOpen ? (
                <Animated.View
                  entering={FadeIn.duration(160)}
                  exiting={FadeOut.duration(120)}
                >
                  <Text style={[styles.faqA, { color: theme.colors.textMuted }]}>
                    {item.a}
                  </Text>
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
          <Text style={[styles.faqMoreText, { color: theme.colors.primary }]}>
            Ver más preguntas
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

// ─── Footer micro ─────────────────────────────────────────────────
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
        <Pressable
          accessibilityRole="button"
          onPress={onRestore}
          hitSlop={6}
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.footerLinkText, { color: theme.colors.textMuted }]}>
            Ya compré antes
          </Text>
        </Pressable>
        {hasActivePlan ? (
          <>
            <View
              style={[
                styles.footerSep,
                { backgroundColor: theme.colors.line },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              onPress={onManage}
              hitSlop={6}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.footerLinkText, { color: theme.colors.textMuted }]}>
                Ver mi suscripción
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
      <Text style={[styles.legal, { color: theme.colors.textSoft }]}>
        El plan se renueva solo al final del período. Puedes cancelar
        desde la tienda cuando quieras. Los precios pueden variar según
        tu país.
      </Text>
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  stack: {
    gap: 16,
    position: 'relative',
  },

  // Hero compacto (88pt incl. padding)
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
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
  heroLeft: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLogoBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(242,234,211,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(242,234,211,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: {
    flex: 1,
    gap: 6,
  },
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
    fontSize: 14,
    fontWeight: '700',
    color: CREAM,
    letterSpacing: -0.1,
    lineHeight: 18,
  },

  // Plan grid
  planGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  tileWrap: {
    flex: 1,
    borderRadius: radii.xl,
    shadowColor: '#0F2D06',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    shadowOpacity: 0.08,
  },
  tile: {
    flex: 1,
    borderRadius: radii.xl,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    minHeight: 196,
    overflow: 'hidden',
  },
  savingsBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    zIndex: 1,
  },
  savingsBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0F2D06',
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  tileEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    paddingRight: 56,
  },
  tilePriceBlock: {
    marginTop: 10,
    minHeight: 46,
    justifyContent: 'flex-start',
  },
  tilePriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  tileCurrency: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  tilePrice: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  tileCycleSuffix: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  tileEffective: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  tileDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  tileCapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 18,
  },
  tileCapText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  tileCapSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 14,
    minHeight: 28,
  },
  tileFooter: {
    marginTop: 'auto',
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCurrent: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  // Plan detail section
  detailWrap: {
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },
  detailHeader: {
    gap: 2,
  },
  detailName: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  detailTagline: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  detailEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  detailList: {
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailCheckIcon: {
    flexShrink: 0,
    marginTop: 0,
  },
  detailFeatureText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.05,
  },
  exclusivePill: {
    flexShrink: 0,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  exclusivePillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  savingsCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 2,
  },
  savingsCalloutText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    letterSpacing: -0.05,
  },

  // Primary CTA
  ctaStack: {
    gap: 6,
  },
  primaryCta: {
    minHeight: 54,
    borderRadius: radii.lg,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#0F2D06',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
  primaryCtaText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F2D06',
    letterSpacing: -0.2,
  },
  trialLink: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  trialLinkText: {
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
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
  currentCtaText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.1,
  },

  // Trust pills, equally distributed across the row
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
  },
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
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  pillText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
    textAlign: 'center',
  },

  // FAQ
  faqStack: {
    gap: 6,
  },
  faqEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    paddingHorizontal: 4,
  },
  faqCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  faqRow: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  faqHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  faqQ: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  faqA: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    paddingTop: 6,
    paddingRight: 22,
  },
  faqMore: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  faqMoreText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.1,
  },

  // Footer micro
  footerStack: {
    gap: 8,
    marginTop: 4,
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  footerSep: {
    width: 3,
    height: 3,
    borderRadius: 999,
  },
  footerLinkText: {
    fontSize: 12,
    fontWeight: '700',
  },
  legal: {
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
})

