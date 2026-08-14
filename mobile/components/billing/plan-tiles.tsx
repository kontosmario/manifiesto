import { memo, useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { CardParticles } from '@/components/ui/card-particles'
import { SkeletonBox } from '@/components/ui/skeleton-box'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { PLAN_SPEC } from '@/components/redesign/auth/plan-spec'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { cssGradient } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { BILLING_PLANS, type BillingPlanId } from '@/features/billing/billing-plans'

/**
 * Tiles de plan comparables (mensual vs anual) — las MISMAS cards que la
 * pantalla de planes aprobada (4m/4mo): el mensual es la card neumórfica
 * neutra y el anual es la verde destacada con luciérnagas y badge
 * RECOMENDADO. Los valores salen de `PLAN_SPEC`, así que la elección de plan
 * se ve idéntica en el paywall y en el sheet de "Cambiar de plan".
 *
 * La selección usa la receta del vocabulario: anillo de 2.5px sobre la sombra
 * de la card + un scale spring corto (solo transform).
 */
export interface PlanTilesProps {
  selected: BillingPlanId
  onSelect(id: BillingPlanId): void
  /** Precios localizados de StoreKit por productId. */
  productPrices?: Record<string, string>
  /** true mientras StoreKit carga: mostramos skeleton en vez del hardcode. */
  loading?: boolean
}

const MONTHLY = BILLING_PLANS['hogar-mensual']
const YEARLY = BILLING_PLANS['hogar-anual']

export const PlanTiles = memo(function PlanTiles({
  selected,
  onSelect,
  productPrices,
  loading = false,
}: PlanTilesProps) {
  const p = PLAN_SPEC[useThemeTokens().mode]
  const { t } = useTranslation()

  const monthStorePrice = productPrices?.[MONTHLY.productId]
  // Skeleton solo mientras StoreKit aún no respondió. Si falló (loading=false
  // sin precio) caemos al hardcode; así nunca flasheamos un monto y lo cambiamos.
  const monthSkeleton = !monthStorePrice && loading
  const monthPrice = monthStorePrice ?? `$${MONTHLY.priceUsd}`

  const yearStorePrice = productPrices?.[YEARLY.productId]
  const yearSkeleton = !yearStorePrice && loading
  const yearPrice = yearStorePrice ?? `$${YEARLY.priceUsd}`

  return (
    <View style={styles.row}>
      <PlanCard
        accessibilityLabel={
          monthSkeleton
            ? t('billing:planTiles.monthlyA11yLoading', { plan: MONTHLY.name })
            : t('billing:planTiles.monthlyA11y', {
                plan: MONTHLY.name,
                price: monthPrice,
              })
        }
        baseShadow={p.monthCardShadow}
        flex={1}
        onPress={() => handlePress(selected === MONTHLY.id, MONTHLY.id, onSelect)}
        ring={p.monthRing}
        selected={selected === MONTHLY.id}
        style={cssGradient(p.monthCardCss, p.monthCardFallback)}
      >
        <Text style={[styles.label, { color: p.monthLabel }]}>
          {t('billing:planTiles.monthly')}
        </Text>
        <View style={styles.priceRow}>
          <PlanPrice
            color={p.monthPrice}
            skeleton={monthSkeleton}
            text={monthPrice}
            width={56}
          />
          <Text style={[styles.per, { color: p.monthPer }]}>
            {t('billing:planTiles.perMonthSuffix')}
          </Text>
        </View>
        <Text style={[styles.meta, { color: p.monthMeta }]}>
          {t('billing:planTiles.people', { count: MONTHLY.memberCap })}
        </Text>
      </PlanCard>

      <PlanCard
        accessibilityLabel={
          yearSkeleton
            ? t('billing:planTiles.annualA11yLoading', { plan: YEARLY.name })
            : t('billing:planTiles.annualA11y', {
                plan: YEARLY.name,
                price: yearPrice,
              })
        }
        baseShadow={p.yearCardShadow}
        flex={1}
        onPress={() => handlePress(selected === YEARLY.id, YEARLY.id, onSelect)}
        ring={p.yearRing}
        selected={selected === YEARLY.id}
        style={[styles.clip, cssGradient(p.yearCardCss, p.yearCardFallback)]}
      >
        {/* Luciérnagas de la card anual, clipeadas a su radio. */}
        <View pointerEvents="none" style={styles.particles}>
          <CardParticles
            accentColor={p.yearParticles[0]}
            color={p.yearParticles[2]}
            count={5}
            peachColor={p.yearParticles[1]}
          />
        </View>
        <View style={styles.content}>
          <View style={styles.yearTopRow}>
            <Text style={[styles.label, { color: p.yearLabel }]}>
              {t('billing:planTiles.annual')}
            </Text>
            <View style={[styles.badge, { backgroundColor: p.yearBadgeBackground }]}>
              <Text style={[styles.badgeText, { color: p.yearBadgeText }]}>
                {t('billing:planTiles.recommended')}
              </Text>
            </View>
          </View>
          <View style={styles.priceRow}>
            <PlanPrice
              color={p.yearPrice}
              skeleton={yearSkeleton}
              skeletonStyle={styles.skeletonOnGreen}
              text={yearPrice}
              width={64}
            />
            <Text style={[styles.per, { color: p.yearPer }]}>
              {t('billing:planTiles.perYearSuffix')}
            </Text>
          </View>
          <Text style={[styles.meta, { color: p.yearMeta }]}>
            {YEARLY.effectiveCopy
              ? t('billing:planTiles.effectivePerMonth', {
                  amount: (YEARLY.priceUsd / 12).toFixed(2),
                })
              : ''}
            {t('billing:planTiles.people', { count: YEARLY.memberCap })}
          </Text>
        </View>
      </PlanCard>
    </View>
  )
})

/**
 * Card de plan seleccionable. El anillo va como sombra `0 0 0 2.5px` sobre la
 * receta de la card (vocabulario del rediseño). Android < API 28 descarta el
 * boxShadow outset EN SILENCIO: ahí el anillo se dibuja como borde, siempre
 * presente (transparente sin selección) para que el layout no salte.
 */
function PlanCard({
  selected,
  ring,
  baseShadow,
  accessibilityLabel,
  flex,
  onPress,
  style,
  children,
}: {
  selected: boolean
  ring: string
  baseShadow: string
  accessibilityLabel: string
  flex: number
  onPress: () => void
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const highlight = useSelectionHighlight(selected)
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ flex }}
    >
      <Animated.View
        style={[
          styles.card,
          style,
          {
            boxShadow:
              selected && SUPPORTS_INSET_SHADOW
                ? `${baseShadow}, 0 0 0 2.5px ${ring}`
                : baseShadow,
          },
          SUPPORTS_INSET_SHADOW
            ? null
            : { borderWidth: 2.5, borderColor: selected ? ring : 'transparent' },
          highlight.style,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  )
}

/**
 * Precio con skeleton mientras StoreKit no respondió; al resolver entra con
 * FadeIn — pero SOLO si hubo skeleton antes (sin carga previa el monto monta
 * directo, sin animación).
 */
function PlanPrice({
  text,
  skeleton,
  color,
  width,
  skeletonStyle,
}: {
  text: string
  skeleton: boolean
  color: string
  width: number
  skeletonStyle?: StyleProp<ViewStyle>
}) {
  const sawSkeleton = useRef(false)
  if (skeleton) {
    sawSkeleton.current = true
    return (
      <SkeletonBox
        height={20}
        radius={6}
        skin="neo"
        style={[styles.priceSkeleton, skeletonStyle]}
        width={width}
      />
    )
  }
  if (sawSkeleton.current) {
    return (
      <Animated.Text
        entering={FadeIn.duration(240)}
        style={[styles.price, { color }]}
      >
        {text}
      </Animated.Text>
    )
  }
  return <Text style={[styles.price, { color }]}>{text}</Text>
}

// ── Highlight animado del tile seleccionado ────────────────────────
// Solo transform (scale). Respeta reduced-motion (snap instantáneo).
function useSelectionHighlight(selected: boolean) {
  const reduced = useReducedMotion()
  const progress = useSharedValue(selected ? 1 : 0)

  useEffect(() => {
    const target = selected ? 1 : 0
    if (reduced) {
      // @motion-allow: reduced-motion snap (1ms ≈ instantáneo)
      progress.value = withTiming(target, { duration: 1 })
    } else {
      // @motion-allow: spring de selección entre tiles de plan
      progress.value = withSpring(target, { damping: 16, stiffness: 220, mass: 0.8 })
    }
  }, [selected, reduced, progress])

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.025 }],
  }))

  return { style }
}

function handlePress(selected: boolean, id: BillingPlanId, onSelect: (id: BillingPlanId) => void) {
  if (selected) return
  void triggerHaptic('selection')
  onSelect(id)
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  card: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: 15,
    paddingHorizontal: 14,
    minHeight: 96,
  },
  // La card anual recorta sus luciérnagas al radio.
  clip: { overflow: 'hidden' },
  particles: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    overflow: 'hidden',
  },
  content: { flex: 1, zIndex: 2 },
  yearTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.26,
  },
  badge: {
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 0.9,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    marginTop: 6,
  },
  price: {
    fontSize: 23,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    lineHeight: 27.6,
  },
  // Skeleton del precio: centrado aprox. contra la caja de línea del precio.
  priceSkeleton: { marginBottom: 5 },
  // Sobre la card anual verde el material base del skeleton no contrasta:
  // crema translúcido.
  skeletonOnGreen: { backgroundColor: 'rgba(255,251,242,0.35)' },
  per: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginBottom: 3,
  },
  meta: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 4,
  },
})
