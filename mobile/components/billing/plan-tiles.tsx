import { memo, useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { CardParticles } from '@/components/ui/card-particles'
import { FernMark } from '@/components/billing/fern-mark'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { BILLING_PLANS, type BillingPlanId } from '@/features/billing/billing-plans'

/**
 * Tiles de plan comparables (mensual vs anual). El mensual es un tile
 * "quiet" sobre crema; el anual es el destacado: gradiente forest +
 * luciérnagas + helecho watermark + badge RECOMENDADO. El tile activo
 * se resalta con un borde + scale animado (solo transform/opacity).
 * Layout/colores espejan el mockup 03-paywall-AC-fireflies-v2 (.tl/.ti).
 */
export interface PlanTilesProps {
  selected: BillingPlanId
  onSelect(id: BillingPlanId): void
  /** Precios reales de la store (RevenueCat) por productId. */
  productPrices?: Record<string, string>
}

const MONTHLY = BILLING_PLANS['hogar-mensual']
const YEARLY = BILLING_PLANS['hogar-anual']

export const PlanTiles = memo(function PlanTiles({
  selected,
  onSelect,
  productPrices,
}: PlanTilesProps) {
  return (
    <View style={styles.row}>
      <MonthlyTile selected={selected === MONTHLY.id} onSelect={onSelect} productPrices={productPrices} />
      <YearlyTile selected={selected === YEARLY.id} onSelect={onSelect} productPrices={productPrices} />
    </View>
  )
})

// ── Tile mensual (quiet) ───────────────────────────────────────────
const MonthlyTile = memo(function MonthlyTile({
  selected,
  onSelect,
  productPrices,
}: {
  selected: boolean
  onSelect(id: BillingPlanId): void
  productPrices?: Record<string, string>
}) {
  const { theme } = useAppTheme()
  const highlight = useSelectionHighlight(selected)
  const price = productPrices?.[MONTHLY.productId] ?? `$${MONTHLY.priceUsd}`

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${MONTHLY.name}, ${price} por mes`}
      onPress={() => handlePress(selected, MONTHLY.id, onSelect)}
      style={styles.flex}
    >
      <Animated.View
        style={[
          styles.tile,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: selected ? theme.colors.primary : theme.colors.border,
            borderWidth: selected ? 2 : 1,
          },
          highlight.style,
        ]}
      >
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>MENSUAL</Text>
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: theme.colors.text }]}>{price}</Text>
          <Text style={[styles.priceSuffix, { color: theme.colors.textMuted }]}> /mes</Text>
        </View>
        <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
          {MONTHLY.memberCap} personas
        </Text>
      </Animated.View>
    </Pressable>
  )
})

// ── Tile anual (destacado, forest) ─────────────────────────────────
const YearlyTile = memo(function YearlyTile({
  selected,
  onSelect,
  productPrices,
}: {
  selected: boolean
  onSelect(id: BillingPlanId): void
  productPrices?: Record<string, string>
}) {
  const { theme } = useAppTheme()
  const highlight = useSelectionHighlight(selected)
  const price = productPrices?.[YEARLY.productId] ?? `$${YEARLY.priceUsd}`

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${YEARLY.name}, recomendado, ${price} por año`}
      onPress={() => handlePress(selected, YEARLY.id, onSelect)}
      style={styles.flex}
    >
      <Animated.View
        style={[
          styles.tile,
          styles.tileBorderless,
          {
            borderColor: selected ? theme.colors.heroAccent : theme.colors.auroraA,
            borderWidth: selected ? 2 : 1,
          },
          highlight.style,
        ]}
      >
        <LinearGradient
          colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientFill}
        >
          {/* Luciérnagas detrás del contenido */}
          <CardParticles count={4} color="#FFFBF2" accentColor="#A6EF8F" />
          {/* Helecho watermark — esquina inf-derecha con bleed */}
          <FernMark variant="cream" size={62} style={styles.fern} />

          <View style={styles.content}>
            <View style={[styles.badge, { backgroundColor: theme.colors.heroAccent }]}>
              <Text style={[styles.badgeText, { color: theme.colors.heroGradient[1] }]}>
                RECOMENDADO
              </Text>
            </View>
            <Text style={[styles.label, { color: theme.colors.heroText }]}>ANUAL</Text>
            <View style={styles.priceRow}>
              <Text style={[styles.price, { color: theme.colors.heroText }]}>{price}</Text>
              <Text style={[styles.priceSuffix, styles.priceSuffixOnForest, { color: theme.colors.heroText }]}>
                {' '}
                /año
              </Text>
            </View>
            <Text style={[styles.sub, styles.subOnForest, { color: theme.colors.heroText }]}>
              {YEARLY.effectiveCopy ? `$${(YEARLY.priceUsd / 12).toFixed(2)}/mes · ` : ''}
              {YEARLY.memberCap} personas
            </Text>
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  )
})

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
  row: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  flex: { flex: 1 },
  tile: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 88,
    padding: 11,
  },
  // El tile anual pinta su fondo vía gradiente; el padding vive adentro.
  tileBorderless: { padding: 0 },
  gradientFill: {
    flex: 1,
    overflow: 'hidden',
    padding: 11,
  },
  content: { flex: 1, zIndex: 2 },
  fern: { position: 'absolute', right: -14, bottom: -16, opacity: 0.13, zIndex: 1 },
  label: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 3 },
  price: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  priceSuffix: {
    fontSize: 10,
    fontWeight: '600',
  },
  priceSuffixOnForest: { opacity: 0.7 },
  sub: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 3,
  },
  subOnForest: {},
  badge: {
    alignSelf: 'flex-start',
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 999,
    zIndex: 3,
  },
  badgeText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
})
